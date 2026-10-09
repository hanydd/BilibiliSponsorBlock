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

/** 词条显示名：用户改过的名字优先，其次是 locales */
export function resolveSponsorRuleDisplayName(
    rule: DynamicSponsorRegexRule,
    uiLanguage: string,
    fallbackLocales?: { [locale: string]: string }
): string | undefined {
    return rule.name?.trim() || resolveSponsorRuleName(rule.locales ?? fallbackLocales, uiLanguage);
}

export function formatSponsorRuleDate(date: SponsorRegexUpdateDate | undefined): string | undefined {
    if (!date || typeof date.year !== "number" || typeof date.month !== "number" || typeof date.day !== "number") {
        return undefined;
    }

    const month = String(date.month).padStart(2, "0");
    const day = String(date.day).padStart(2, "0");
    return `${date.year}-${month}-${day}`;
}

export function todaySponsorRuleDate(): SponsorRegexUpdateDate {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/**
 * 拆分旧版本保存的 `/模式/flags` 形式，供配置迁移使用
 */
export function splitLegacySponsorPattern(value: string): { source: string; flags: string | null } {
    const literal = value.match(/^\/(.*)\/([gimsuy]*)$/);
    return literal ? { source: literal[1], flags: literal[2] } : { source: value, flags: null };
}

/**
 * 按顶层 `|` 拆分正则
 */
export function splitTopLevelAlternatives(source: string): string[] {
    const alternatives: string[] = [];
    let current = "";
    let depth = 0;
    let inCharacterClass = false;

    for (let index = 0; index < source.length; index++) {
        const char = source[index];

        if (char === "\\") {
            current += char + (source[index + 1] ?? "");
            index++;
            continue;
        }

        if (inCharacterClass) {
            if (char === "]") inCharacterClass = false;
            current += char;
            continue;
        }

        if (char === "[") {
            inCharacterClass = true;
            current += char;
            continue;
        }

        if (char === "(") {
            depth++;
        } else if (char === ")") {
            depth = Math.max(0, depth - 1);
        } else if (char === "|" && depth === 0) {
            alternatives.push(current);
            current = "";
            continue;
        }

        current += char;
    }

    alternatives.push(current);

    return alternatives;
}

export function stripEmptySponsorAlternatives(pattern: string): string {
    let result = pattern;

    for (;;) {
        const next = result
            .replace(/\((?:\?:)?\)/g, "") // 空分组 () / (?:)
            .replace(/\(\?:\|/g, "(") // (?:|a) -> (a)
            .replace(/\(\|/g, "(") // (|a) -> (a)
            .replace(/\|\)/g, ")") // (a|) -> (a)
            .replace(/\|{2,}/g, "|")
            .replace(/^\|+|\|+$/g, "")
            .trim();

        if (next === result) return next;
        result = next;
    }
}

/** 编译结果缓存：内容页每条动态都要用全部词条匹配，避免重复构造 RegExp */
const patternCache = new Map<string, RegExp | null>();
const MAX_PATTERN_CACHE_ENTRIES = 256;

/** 编译规则内容，非法正则返回 null */
export function compileSponsorPattern(pattern: string, flags = ""): RegExp | null {
    const source = pattern?.trim();
    if (!source) return null;

    // g/y 会让 test() 在多次调用间保留 lastIndex，这里始终以无状态方式编译
    const statelessFlags = sanitizeSponsorRegexFlags(flags).replace(/[gy]/g, "");
    const cacheKey = `${statelessFlags}\u0000${source}`;
    const cached = patternCache.get(cacheKey);
    if (cached !== undefined) return cached;

    let compiled: RegExp | null = null;
    try {
        compiled = new RegExp(source, statelessFlags);
    } catch {
        compiled = null;
    }

    if (patternCache.size >= MAX_PATTERN_CACHE_ENTRIES) patternCache.clear();
    patternCache.set(cacheKey, compiled);

    return compiled;
}

/** 收集命中：global 时返回全部匹配，否则只取首个（regex 已由调用方编译并剥掉 g） */
function collectMatches(text: string, regex: RegExp, global: boolean): string[] {
    // 全局匹配用一次性实例，避免共享缓存正则的 lastIndex
    const matches = text.match(global ? new RegExp(regex.source, regex.flags + "g") : regex) ?? [];
    if (matches.length === 0) return [];

    return global ? matches : [matches[0]];
}

/**
 * 用启用的规则匹配文本，判断是否达到屏蔽条件。
 *
 * 命中的关键词会被去重并忽略单字符命中；`matches` 是全部命中，`matched` 表示数量是否达到阈值。
 */
export function matchSponsorRules(
    text: string,
    rules: DynamicSponsorRegexRule[] | undefined,
    flags = "",
    keywordNumber = 1
): SponsorRegexMatchResult {
    const enabledRules = (rules ?? []).filter((rule) => rule.enabled && rule.pattern?.trim());
    const matches = new Set<string>();
    const global = sanitizeSponsorRegexFlags(flags).includes("g");

    for (const rule of enabledRules) {
        const source = rule.pattern.trim();
        const test = compileSponsorPattern(source, flags);
        if (!test || !test.test(text)) continue;

        for (const hit of collectMatches(text, test, global)) {
            if (hit.length >= MIN_MATCH_LENGTH) matches.add(hit);
        }
    }

    const matchList = [...matches];
    const threshold = Math.max(1, keywordNumber || 1);

    return { matched: matchList.length >= threshold, matches: matchList };
}
