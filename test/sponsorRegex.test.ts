import {
    DynamicSponsorRegexRule,
    SPONSOR_REGEX_FLAGS,
    compileSponsorPattern,
    formatSponsorRuleDate,
    matchSponsorRules,
    resolveSponsorRuleName,
    sanitizeSponsorRegexFlags,
    splitLegacySponsorPattern,
    todaySponsorRuleDate,
} from "../src/utils/sponsorRegex";

function rule(id: string, pattern: string, enabled = true): DynamicSponsorRegexRule {
    return { id, pattern, enabled };
}

describe("todaySponsorRuleDate", () => {
    test("返回合法的当天日期", () => {
        const today = todaySponsorRuleDate();
        const now = new Date();

        expect(today.year).toBe(now.getFullYear());
        expect(today.month).toBe(now.getMonth() + 1);
        expect(today.day).toBe(now.getDate());
        expect(formatSponsorRuleDate(today)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe("resolveSponsorRuleName", () => {
    const locales = { en: "Food Delivery", zh_CN: "外卖", zh_TW: "外送" };

    test("按完整 UI 语言匹配，连字符与下划线等价", () => {
        expect(resolveSponsorRuleName(locales, "zh_CN")).toBe("外卖");
        expect(resolveSponsorRuleName(locales, "zh-CN")).toBe("外卖");
    });

    test("无完整匹配时回退到语言主段与 en", () => {
        expect(resolveSponsorRuleName(locales, "en-US")).toBe("Food Delivery");
        expect(resolveSponsorRuleName(locales, "zh-HK")).toBe("Food Delivery");
        expect(resolveSponsorRuleName({ ja: "デリバリー" }, "en-US")).toBe("デリバリー");
    });

    test("没有可用名称时返回 undefined", () => {
        expect(resolveSponsorRuleName(undefined, "en")).toBeUndefined();
        expect(resolveSponsorRuleName({}, "en")).toBeUndefined();
    });
});

describe("formatSponsorRuleDate", () => {
    test("输出补零的 YYYY-MM-DD", () => {
        expect(formatSponsorRuleDate({ year: 2026, month: 10, day: 7 })).toBe("2026-10-07");
        expect(formatSponsorRuleDate({ year: 2025, month: 5, day: 17 })).toBe("2025-05-17");
    });

    test("缺字段时返回 undefined", () => {
        expect(formatSponsorRuleDate(undefined)).toBeUndefined();
        expect(formatSponsorRuleDate({ year: 2026, month: 10 } as never)).toBeUndefined();
    });
});

describe("sanitizeSponsorRegexFlags", () => {
    test("保留受支持的 flags 并去重", () => {
        expect(sanitizeSponsorRegexFlags("gi")).toBe("gi");
        expect(sanitizeSponsorRegexFlags("ggiix")).toBe("gi");
        expect(sanitizeSponsorRegexFlags("imsuy")).toBe("imsu");
        expect(sanitizeSponsorRegexFlags("")).toBe("");
        expect(sanitizeSponsorRegexFlags(undefined)).toBe("");
    });

    test("对外暴露的 flags 列表与 g/i 用法一致", () => {
        expect(SPONSOR_REGEX_FLAGS).toEqual(["g", "i", "m", "s", "u"]);
    });
});

describe("splitLegacySponsorPattern", () => {
    test("拆分旧版本的 /模式/flags", () => {
        expect(splitLegacySponsorPattern("/foo|bar/gi")).toEqual({ source: "foo|bar", flags: "gi" });
        expect(splitLegacySponsorPattern("/foo/")).toEqual({ source: "foo", flags: "" });
    });

    test("没有斜杠形式时 flags 为 null", () => {
        expect(splitLegacySponsorPattern("foo|bar")).toEqual({ source: "foo|bar", flags: null });
    });
});

describe("compileSponsorPattern", () => {
    test("非法正则返回 null", () => {
        expect(compileSponsorPattern("(unclosed")).toBeNull();
        expect(compileSponsorPattern("广告")).not.toBeNull();
    });

    test("i flag 决定是否忽略大小写", () => {
        expect(compileSponsorPattern("jd|京东", "i").test("JD")).toBe(true);
        expect(compileSponsorPattern("jd|京东", "").test("JD")).toBe(false);
    });

    test("g flag 不会让 test 在多次调用间保留状态", () => {
        const regex = compileSponsorPattern("秒杀", "g");
        expect(regex.test("秒杀")).toBe(true);
        expect(regex.test("秒杀")).toBe(true);
    });
});

describe("matchSponsorRules", () => {
    test("启用词条命中关键词即屏蔽", () => {
        const rules = [rule("shoppingSite", "淘宝搜索"), rule("delivery", "美团外卖")];

        const hit = matchSponsorRules("点击淘宝搜索下单", rules, "gi");
        expect(hit.matched).toBe(true);
        expect(hit.matches).toEqual(["淘宝搜索"]);
        expect(hit.matchedRuleIds).toEqual(["shoppingSite"]);

        expect(matchSponsorRules("今天点了美团外卖", rules, "gi").matched).toBe(true);
        expect(matchSponsorRules("普通的日常动态", rules, "gi").matched).toBe(false);
    });

    test("flags 影响所有词条的匹配", () => {
        const rules = [rule("shoppingSite", "jd搜索")];

        expect(matchSponsorRules("JD搜索", rules, "gi").matched).toBe(true);
        expect(matchSponsorRules("JD搜索", rules, "g").matched).toBe(false);
        expect(matchSponsorRules("JD搜索", rules, "").matched).toBe(false);
    });

    test("停用的词条不参与匹配", () => {
        const rules = [rule("shoppingSite", "淘宝搜索", false), rule("delivery", "美团外卖")];

        const result = matchSponsorRules("点击淘宝搜索下单", rules, "gi");
        expect(result.matched).toBe(false);
        expect(result.matchedRuleIds).toEqual([]);
    });

    test("阈值决定需要命中多少个关键词", () => {
        const rules = [rule("misc", "秒杀|折扣")];

        const loose = matchSponsorRules("全场秒杀 大折扣", rules, "gi", 2);
        expect(loose.matched).toBe(true);
        expect(loose.matches.sort()).toEqual(["折扣", "秒杀"]);

        expect(matchSponsorRules("全场秒杀 大折扣", rules, "gi", 3).matched).toBe(false);
        expect(matchSponsorRules("全场秒杀", rules, "gi", 1).matched).toBe(true);
        expect(matchSponsorRules("全场秒杀", rules, "gi", 2).matched).toBe(false);
    });

    test("单字命中不计入关键词数量", () => {
        const rules = [rule("coupon", "券")];

        expect(matchSponsorRules("只有一张券", rules, "gi", 1).matches).toEqual([]);
        expect(matchSponsorRules("只有一张券", rules, "gi", 1).matched).toBe(false);
    });

    test("关闭 g 时只统计首个命中", () => {
        const rules = [rule("misc", "秒杀|折扣")];

        expect(matchSponsorRules("全场秒杀 大折扣", rules, "i", 2).matches).toEqual(["秒杀"]);
        expect(matchSponsorRules("全场秒杀 大折扣", rules, "i", 2).matched).toBe(false);
    });

    test("无启用词条时不屏蔽", () => {
        expect(matchSponsorRules("全场秒杀", [rule("misc", "秒杀", false)], "gi").matched).toBe(false);
    });

    test("非法正则被跳过而不影响其它词条", () => {
        const rules = [rule("broken", "(unclosed"), rule("delivery", "美团外卖")];

        const result = matchSponsorRules("今天点了美团外卖", rules, "gi");
        expect(result.matched).toBe(true);
        expect(result.matchedRuleIds).toEqual(["delivery"]);
    });

    test("缺少规则列表时不抛错", () => {
        expect(matchSponsorRules("任意内容", undefined, "gi").matched).toBe(false);
    });
});
