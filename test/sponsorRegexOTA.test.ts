/** @jest-environment node */
import { applyRulesConfig } from "../src/requests/background/sponsorRegexConfigUpdate";
import Config from "../src/config";
import {
    Rule,
    getBuiltinSponsorRegexRule,
    getEffectiveSponsorRegexRules,
    getLatestDefaultUpdateDate,
    getUserSponsorRegexRules,
    isRulesConfig,
    setUserSponsorRegexRules,
} from "../src/config/sponsorRegexOTA";
import { DynamicSponsorRegexRule } from "../src/utils/sponsorRegex";

jest.mock("../src/requests/background-request-proxy", () => ({ callAPI: jest.fn() }));

jest.mock("../src/config", () => ({
    __esModule: true,
    default: {
        config: { dynamicAndCommentSponsorRegexUserRules: [] },
        local: {
            sponsorRegexRemoteConfig: null,
            lastSponsorRegexConfigCheck: 0,
            lastSponsorRegexConfigCheckFailed: false,
        },
    },
}));

function rule(id: string, pattern: string, enabled = true, version = 1): Rule {
    return {
        id,
        locales: { en: id, zh_CN: id, zh_TW: id },
        pattern,
        enabled,
        version,
        updateAt: { year: 2026, month: 10, day: 7 },
    };
}

const baselineRules = [rule("shoppingSite", "(?:淘宝|京东)搜索"), rule("delivery", "美团外卖")];

beforeEach(() => {
    Config.config.dynamicAndCommentSponsorRegexUserRules = [];
    Config.local.sponsorRegexRemoteConfig = { rules: cloneRules(baselineRules) };
    Config.local.lastSponsorRegexConfigCheck = 0;
    Config.local.lastSponsorRegexConfigCheckFailed = false;
});

function cloneRules<T extends DynamicSponsorRegexRule>(rules: T[]): T[] {
    return rules.map((item) => ({ ...item }));
}

describe("isRulesConfig", () => {
    test("接受合法配置（多余字段不影响）", () => {
        expect(isRulesConfig({ comment: "随便什么说明", rules: [{ ...rule("delivery", "美团外卖", false), note: "extra" }] })).toBe(true);
    });

    test("locales 只要求 en，缺失的其它语言回退到 en", () => {
        expect(isRulesConfig({ rules: [{ ...rule("a", "b", true, 1), locales: { en: "a" } }] })).toBe(true);
        expect(isRulesConfig({ rules: [{ ...rule("a", "b", true, 1), locales: { en: "a", zh_CN: "a" } }] })).toBe(true);
        expect(
            isRulesConfig({ rules: [{ ...rule("a", "b", true, 1), locales: { en: "a", ja: "デリバリー" } }] })
        ).toBe(true);
    });

    test("拒绝异常结构", () => {
        expect(isRulesConfig(null)).toBe(false);
        expect(isRulesConfig({})).toBe(false);
        expect(isRulesConfig({ rules: [] })).toBe(false);
        expect(isRulesConfig({ rules: [{ ...rule("a", "b"), id: "bad id!" }] })).toBe(false);
        expect(isRulesConfig({ rules: [{ ...rule("a", "") }] })).toBe(false);
        expect(isRulesConfig({ rules: [{ ...rule("a", "   ") }] })).toBe(false);
        expect(isRulesConfig({ rules: [{ ...rule("a", "b"), enabled: "yes" }] })).toBe(false);
        expect(isRulesConfig({ rules: [{ ...rule("a", "b"), version: 0 }] })).toBe(false);
        expect(isRulesConfig({ rules: [{ ...rule("a", "b"), version: 1.5 }] })).toBe(false);
        expect(isRulesConfig({ rules: [{ ...rule("a", "b", true, 1), locales: {} }] })).toBe(false);
        expect(
            isRulesConfig({ rules: [{ ...rule("a", "b", true, 1), locales: { en: "a", zh_TW: "" } }] })
        ).toBe(false);
        expect(
            isRulesConfig({ rules: [{ ...rule("a", "b", true, 1), locales: { en: "", zh_CN: "a", zh_TW: "a" } }] })
        ).toBe(false);
        expect(
            isRulesConfig({ rules: [{ ...rule("a", "b", true, 1), updateAt: { year: 2026, month: 13, day: 1 } }] })
        ).toBe(false);
        expect(
            isRulesConfig({ rules: [{ ...rule("a", "b", true, 1), updateAt: { year: 2026, month: 10 } }] })
        ).toBe(false);
    });
});

describe("getEffectiveSponsorRegexRules", () => {
    test("重复 id 用用户版本，默认词条保持顺序，自建词条追加在后", () => {
        Config.config.dynamicAndCommentSponsorRegexUserRules = [
            rule("shoppingSite", "用户改的搜索", false),
            rule("custom_1", "自定义"),
        ];

        expect(getEffectiveSponsorRegexRules()).toEqual([
            rule("shoppingSite", "用户改的搜索", false),
            rule("delivery", "美团外卖"),
            rule("custom_1", "自定义"),
        ]);
    });

    test("没有用户词条时就是默认词条", () => {
        expect(getEffectiveSponsorRegexRules()).toEqual(baselineRules);
    });
});

describe("applyRulesConfig", () => {
    test("版本未提高的词条保持现状", () => {
        const snapshot = Config.local.sponsorRegexRemoteConfig;

        const result = applyRulesConfig({ rules: cloneRules(baselineRules) });

        expect(result.status).toBe("up-to-date");
        expect(Config.local.sponsorRegexRemoteConfig).toBe(snapshot);
    });

    test("远端改了内容但没递增 version 时被忽略", () => {
        const result = applyRulesConfig({
            rules: [rule("shoppingSite", "偷偷改的模式", true, 1), rule("delivery", "美团外卖")],
        });

        expect(result.status).toBe("up-to-date");
    });

    test("应用更新版本时只写本地快照，用户词条原样保留", () => {
        const userRules = [rule("shoppingSite", "用户改的搜索", true, 1), rule("custom_1", "自定义")];
        Config.config.dynamicAndCommentSponsorRegexUserRules = userRules;

        const result = applyRulesConfig({
            rules: [rule("shoppingSite", "新模式", true, 2), rule("otaNew", "新词条")],
        });

        expect(result.status).toBe("updated");
        expect(Config.local.sponsorRegexRemoteConfig?.rules).toEqual([
            rule("shoppingSite", "新模式", true, 2),
            rule("otaNew", "新词条"),
        ]);
        expect(Config.config.dynamicAndCommentSponsorRegexUserRules).toEqual(userRules);
        expect(getEffectiveSponsorRegexRules()).toEqual([
            rule("shoppingSite", "用户改的搜索", true, 1),
            rule("otaNew", "新词条"),
            rule("custom_1", "自定义"),
        ]);
    });

    test("用户停用的内置词条在 OTA 更新后仍然停用", () => {
        Config.config.dynamicAndCommentSponsorRegexUserRules = [rule("delivery", "美团外卖", false, 1)];

        applyRulesConfig({ rules: cloneRules(baselineRules).map((item) => ({ ...item, version: 2 })) });

        expect(getEffectiveSponsorRegexRules()).toEqual([
            rule("shoppingSite", "(?:淘宝|京东)搜索", true, 2),
            rule("delivery", "美团外卖", false, 1),
        ]);
    });

    test("只采用 version 更高的词条，不因为其它词条有更新就整体降级", () => {
        Config.local.sponsorRegexRemoteConfig = {
            rules: [rule("shoppingSite", "本地新版本", true, 5), rule("delivery", "外卖", true, 3)],
        };

        const result = applyRulesConfig({
            rules: [rule("shoppingSite", "远端旧版本", true, 3), rule("delivery", "外卖更新", true, 4)],
        });

        expect(result.status).toBe("updated");
        expect(Config.local.sponsorRegexRemoteConfig?.rules).toEqual([
            rule("shoppingSite", "本地新版本", true, 5),
            rule("delivery", "外卖更新", true, 4),
        ]);
    });

    test("用户词条里只存改过的字段时用默认词条补齐", () => {
        Config.config.dynamicAndCommentSponsorRegexUserRules = [
            { id: "shoppingSite", pattern: "用户改的搜索", enabled: false },
        ];

        const [shoppingSite] = getEffectiveSponsorRegexRules();

        expect(shoppingSite.pattern).toBe("用户改的搜索");
        expect(shoppingSite.enabled).toBe(false);
        expect(shoppingSite.locales).toEqual(baselineRules[0].locales);
        expect(shoppingSite.version).toBe(baselineRules[0].version);
    });
});

describe("getLatestDefaultUpdateDate", () => {
    test("返回生效默认词条里最近的更新日期", () => {
        Config.local.sponsorRegexRemoteConfig = {
            rules: [
                { ...rule("a", "a", true, 1), updateAt: { year: 2026, month: 1, day: 3 } },
                { ...rule("b", "b", true, 1), updateAt: { year: 2026, month: 10, day: 7 } },
            ],
        };

        expect(getLatestDefaultUpdateDate()).toBe("2026-10-07");
    });
});

describe("用户词条与默认词条", () => {
    test("能按 id 取到默认词条，用于判断只能重置的内置词条", () => {
        expect(getBuiltinSponsorRegexRule("shoppingSite")).toEqual(baselineRules[0]);
        expect(getBuiltinSponsorRegexRule("custom_1")).toBeUndefined();
    });

    test("用户词条读写同步存储，并参与生效词条", () => {
        const rules = [{ id: "custom_new", pattern: "新的", enabled: true }];

        setUserSponsorRegexRules(rules);

        expect(Config.config.dynamicAndCommentSponsorRegexUserRules).toEqual(rules);
        expect(getUserSponsorRegexRules()).toEqual(rules);
        expect(getEffectiveSponsorRegexRules().map((item) => item.id)).toEqual([
            ...baselineRules.map((item) => item.id),
            "custom_new",
        ]);
    });
});
