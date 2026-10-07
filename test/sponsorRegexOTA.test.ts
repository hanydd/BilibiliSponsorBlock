/** @jest-environment node */
import Config from "../src/config";
import {
    Rule,
    applyRulesConfig,
    checkSponsorRegexConfigUpdate,
    getDefaultSponsorRegexRules,
    getLatestDefaultUpdateDate,
    isRulesConfig,
    mergeSponsorRegexRulesWithDefaults,
} from "../src/config/sponsorRegexOTA";
import { DynamicSponsorRegexRule } from "../src/utils/sponsorRegex";

jest.mock("../src/config", () => ({
    __esModule: true,
    default: {
        config: { dynamicAndCommentSponsorRegexRules: [] },
        local: { sponsorRegexRemoteConfig: null, lastSponsorRegexConfigCheck: 0 },
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
    Config.config.dynamicAndCommentSponsorRegexRules = cloneRules(baselineRules);
    Config.local.sponsorRegexRemoteConfig = { rules: cloneRules(baselineRules), appliedAt: 1 };
    Config.local.lastSponsorRegexConfigCheck = 0;
});

function cloneRules<T extends DynamicSponsorRegexRule>(rules: T[]): T[] {
    return rules.map((item) => ({ ...item }));
}

describe("isRulesConfig", () => {
    test("接受合法配置（多余字段不影响）", () => {
        expect(isRulesConfig({ comment: "随便什么说明", rules: [{ ...rule("delivery", "美团外卖", false), note: "extra" }] })).toBe(true);
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
        expect(
            isRulesConfig({ rules: [{ ...rule("a", "b", true, 1), locales: { en: "a", zh_CN: "a" } }] })
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

describe("mergeSponsorRegexRulesWithDefaults", () => {
    test("未修改的词条跟随新默认值", () => {
        const oldDefaults = [rule("shoppingSite", "旧模式")];
        const userRules = [rule("shoppingSite", "旧模式")];
        const newDefaults = [rule("shoppingSite", "新模式", false, 2)];

        expect(mergeSponsorRegexRulesWithDefaults(userRules, newDefaults, oldDefaults)).toEqual([
            rule("shoppingSite", "新模式", false, 2),
        ]);
    });

    test("用户改过的模式与开关保持不变", () => {
        const oldDefaults = [rule("shoppingSite", "旧模式"), rule("delivery", "旧外卖")];
        const userRules = [rule("shoppingSite", "用户改的模式"), rule("delivery", "旧外卖", false)];
        const newDefaults = [rule("shoppingSite", "新模式", false, 2), rule("delivery", "新外卖", true, 2)];

        expect(mergeSponsorRegexRulesWithDefaults(userRules, newDefaults, oldDefaults)).toEqual([
            rule("shoppingSite", "用户改的模式", false, 2),
            rule("delivery", "新外卖", false, 2),
        ]);
    });

    test("自定义词条保留，被移除的内置词条仅在用户改过模式时保留", () => {
        const oldDefaults = [rule("shoppingSite", "旧模式"), rule("removed", "旧规则")];
        const userRules = [
            rule("custom_1", "自定义"),
            rule("removed", "旧规则"),
            rule("shoppingSite", "用户改的模式"),
        ];
        const newDefaults = [rule("shoppingSite", "新模式", true, 2)];

        const merged = mergeSponsorRegexRulesWithDefaults(userRules, newDefaults, oldDefaults);
        expect(merged).toEqual([rule("shoppingSite", "用户改的模式", true, 2), rule("custom_1", "自定义")]);
    });

    test("在线配置新增的词条对老用户可用", () => {
        const oldDefaults = [rule("shoppingSite", "旧模式")];
        const userRules = [rule("shoppingSite", "旧模式")];
        const newDefaults = [rule("shoppingSite", "旧模式"), rule("otaNew", "新词条")];

        expect(mergeSponsorRegexRulesWithDefaults(userRules, newDefaults, oldDefaults)).toEqual([
            rule("shoppingSite", "旧模式"),
            rule("otaNew", "新词条"),
        ]);
    });
});

describe("applyRulesConfig", () => {
    test("版本未提高的词条保持现状", () => {
        const result = applyRulesConfig({ rules: cloneRules(baselineRules) });

        expect(result.status).toBe("up-to-date");
        expect(Config.config.dynamicAndCommentSponsorRegexRules).toEqual(baselineRules);
    });

    test("远端改了内容但没递增 version 时被忽略", () => {
        const result = applyRulesConfig({
            rules: [rule("shoppingSite", "偷偷改的模式", true, 1), rule("delivery", "美团外卖")],
        });

        expect(result.status).toBe("up-to-date");
        expect(Config.config.dynamicAndCommentSponsorRegexRules).toEqual(baselineRules);
    });

    test("应用更新版本时合并用户修改并记录本地快照", () => {
        Config.config.dynamicAndCommentSponsorRegexRules = [
            rule("shoppingSite", "用户改的模式"),
            rule("custom_1", "自定义"),
        ];

        const result = applyRulesConfig({
            rules: [rule("shoppingSite", "新模式", true, 2), rule("otaNew", "新词条")],
        });

        expect(result.status).toBe("updated");
        expect(result.updatedCount).toBe(2);
        expect(Config.config.dynamicAndCommentSponsorRegexRules).toEqual([
            rule("shoppingSite", "用户改的模式", true, 2),
            rule("otaNew", "新词条"),
            rule("custom_1", "自定义"),
        ]);
        expect(Config.local.sponsorRegexRemoteConfig?.appliedAt).toBeGreaterThan(0);
        // 快照保存的是“默认内容”（新模式），后续判断用户是否修改以此为基准
        expect(Config.local.sponsorRegexRemoteConfig?.rules).toEqual([
            rule("shoppingSite", "新模式", true, 2),
            rule("otaNew", "新词条"),
        ]);
        expect(getDefaultSponsorRegexRules()).toEqual([
            rule("shoppingSite", "新模式", true, 2),
            rule("otaNew", "新词条"),
        ]);
    });
});

describe("checkSponsorRegexConfigUpdate", () => {
    test("节流时间内不再请求", async () => {
        const fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
        Config.local.lastSponsorRegexConfigCheck = Date.now();

        const result = await checkSponsorRegexConfigUpdate();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.status).toBe("up-to-date");
    });

    test("拉取并应用成功后返回更新的词条数量", async () => {
        Config.config.dynamicAndCommentSponsorRegexRules = cloneRules(baselineRules);
        const fetchMock = jest.fn().mockResolvedValue(
            new Response(JSON.stringify({ rules: [rule("shoppingSite", "在线模式", true, 3)] }), { status: 200 })
        );
        global.fetch = fetchMock as unknown as typeof fetch;

        const result = await checkSponsorRegexConfigUpdate(true);

        expect(fetchMock).toHaveBeenCalled();
        expect(result.status).toBe("updated");
        expect(result.updatedCount).toBe(1);
        // delivery 不在在线配置里且未被用户修改，随更新一起移除
        expect(Config.config.dynamicAndCommentSponsorRegexRules).toEqual([rule("shoppingSite", "在线模式", true, 3)]);
        expect(Config.local.lastSponsorRegexConfigCheck).toBeGreaterThan(0);
    });

    test("请求失败时保持现有配置", async () => {
        const fetchMock = jest.fn().mockResolvedValue(new Response("not json", { status: 500 }));
        global.fetch = fetchMock as unknown as typeof fetch;

        const result = await checkSponsorRegexConfigUpdate(true);

        expect(result.status).toBe("failed");
        expect(Config.config.dynamicAndCommentSponsorRegexRules).toEqual(baselineRules);
    });
});

describe("getLatestDefaultUpdateDate", () => {
    test("返回生效默认词条里最近的更新日期", () => {
        Config.local.sponsorRegexRemoteConfig = {
            rules: [
                { ...rule("a", "a", true, 1), updateAt: { year: 2026, month: 1, day: 3 } },
                { ...rule("b", "b", true, 1), updateAt: { year: 2026, month: 10, day: 7 } },
            ],
            appliedAt: 1,
        };

        expect(getLatestDefaultUpdateDate()).toBe("2026-10-07");
    });
});
