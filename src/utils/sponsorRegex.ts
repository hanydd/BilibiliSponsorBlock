/**
 * 动态/评论柔性推广屏蔽所使用的匹配规则
 *
 * 每条规则都可以单独启用，正则 flags（g/i/m/s/u）通过独立的“匹配模式”设置统一配置
 */

export interface DynamicSponsorRegexRule {
    /** 稳定标识；内置词条使用固定 id，自定义词条使用 "custom_*" id */
    id: string;
    name?: string;
    locales?: { [locale: string]: string };
    pattern: string;
    enabled: boolean;
    version?: number;
    updateAt?: SponsorRegexUpdateDate;
}

export interface SponsorRegexUpdateDate {
    year: number;
    month: number;
    day: number;
}

export interface SponsorRegexMatchResult {
    matched: boolean;
    matches: string[];
    matchedRuleIds: string[];
}

export const SPONSOR_REGEX_FLAGS = ["g", "i", "m", "s", "u"] as const;
export type SponsorRegexFlag = (typeof SPONSOR_REGEX_FLAGS)[number];
const MIN_MATCH_LENGTH = 2;

/** 去掉不支持的 flag 与重复项，避免 new RegExp 因 flags 抛错 */
export function sanitizeSponsorRegexFlags(flags: string | undefined): string {
    const seen = new Set<string>();
    let result = "";

    for (const flag of flags ?? "") {
        if (SPONSOR_REGEX_FLAGS.includes(flag as SponsorRegexFlag) && !seen.has(flag)) {
            seen.add(flag);
            result += flag;
        }
    }

    return result;
}

export function resolveSponsorRuleName(locales: { [locale: string]: string } | undefined, uiLanguage: string): string | undefined {
    if (!locales) return undefined;

    const candidates = [uiLanguage, uiLanguage?.replace("-", "_"), uiLanguage?.split("-")[0], "en"].filter(
        (candidate): candidate is string => Boolean(candidate)
    );
    for (const candidate of candidates) {
        const name = locales[candidate]?.trim();
        if (name) return name;
    }

    return Object.values(locales).find((name) => name?.trim())?.trim();
}

export function formatSponsorRuleDate(date: SponsorRegexUpdateDate | undefined): string | undefined {
    if (!date || typeof date.year !== "number" || typeof date.month !== "number" || typeof date.day !== "number") {
        return undefined;
    }

    const month = String(date.month).padStart(2, "0");
    const day = String(date.day).padStart(2, "0");
    return `${date.year}-${month}-${day}`;
}

/**
 * 拆分旧版本保存的 `/模式/flags` 形式，供配置迁移使用。
 * flags 为 null 表示旧值没有斜杠形式（当时等同于不区分大小写、只取首个命中）。
 */
export function splitLegacySponsorPattern(value: string): { source: string; flags: string | null } {
    const literal = value.match(/^\/(.*)\/([gimsuy]*)$/);
    return literal ? { source: literal[1], flags: literal[2] } : { source: value, flags: null };
}

/** 编译规则内容，非法正则返回 null */
export function compileSponsorPattern(pattern: string, flags = ""): RegExp | null {
    const source = pattern?.trim();
    if (!source) return null;

    try {
        // g/y 会让 test() 在多次调用间保留 lastIndex，这里始终以无状态方式编译
        return new RegExp(source, sanitizeSponsorRegexFlags(flags).replace(/[gy]/g, ""));
    } catch {
        return null;
    }
}

function collectMatches(text: string, source: string, flags: string): string[] {
    const global = flags.includes("g");
    const regex = new RegExp(source, flags.replace(/[gy]/g, "") + (global ? "g" : ""));

    const result = text.match(regex) ?? [];
    if (result.length === 0) return [];

    return global ? result : [result[0]];
}

/**
 * 用启用的规则匹配文本，判断是否达到屏蔽条件。
 *
 * 命中的关键词会被去重并忽略单字符命中；只有数量达到阈值（默认 1）才视为疑似推广。
 */
export function matchSponsorRules(
    text: string,
    rules: DynamicSponsorRegexRule[] | undefined,
    flags = "",
    keywordNumber = 1
): SponsorRegexMatchResult {
    const enabledRules = (rules ?? []).filter((rule) => rule.enabled && rule.pattern?.trim());
    const matches = new Set<string>();
    const matchedRuleIds: string[] = [];

    for (const rule of enabledRules) {
        const source = rule.pattern.trim();
        const test = compileSponsorPattern(source, flags);
        if (!test || !test.test(text)) continue;

        matchedRuleIds.push(rule.id);

        for (const hit of collectMatches(text, source, flags)) {
            if (hit.length >= MIN_MATCH_LENGTH) matches.add(hit);
        }
    }

    const matchList = [...matches];
    const threshold = Math.max(1, Number(keywordNumber) || 1);

    return { matched: matchList.length >= threshold, matches: matchList, matchedRuleIds };
}
