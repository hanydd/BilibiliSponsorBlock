export interface DynamicSponsorRegexRule {
    /** 默认规则和用户覆盖记录通过此 id 关联；迁移规则保留 legacyCustom，新建规则使用 custom_ 前缀。 */
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

/** 拆分旧版本保存的 `/模式/flags` 形式，供配置迁移使用 */
export function splitLegacySponsorPattern(value: string): { source: string; flags: string | null } {
    const literal = value.match(/^\/(.*)\/([gimsuy]*)$/);
    return literal ? { source: literal[1], flags: literal[2] } : { source: value, flags: null };
}

/** 迁移仅拆分顶层分支，保留分组、字符类和转义中的 |。 */
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

/** 迁移时清理移除默认分支后留下的空分组和分支；使用文本替换，不解析正则语法树。 */
export function stripEmptySponsorAlternatives(pattern: string): string {
    let result = pattern;

    for (;;) {
        const next = result
            .replace(/\((?:\?:)?\)/g, "")
            .replace(/\(\?:\|/g, "(")
            .replace(/\(\|/g, "(")
            .replace(/\|\)/g, ")")
            .replace(/\|{2,}/g, "|")
            .replace(/^\|+|\|+$/g, "")
            .trim();

        if (next === result) return next;
        result = next;
    }
}

/** 跨动态和评论复用编译结果；无效模式也缓存为 null，避免重复编译并抛错。 */
const patternCache = new Map<string, RegExp | null>();
const MAX_PATTERN_CACHE_ENTRIES = 256;

function cacheCompiledPattern(cacheKey: string, build: () => RegExp): RegExp | null {
    const cached = patternCache.get(cacheKey);
    if (cached !== undefined) return cached;

    let compiled: RegExp | null = null;
    try {
        compiled = build();
    } catch {
        compiled = null;
    }

    if (patternCache.size >= MAX_PATTERN_CACHE_ENTRIES) patternCache.clear();
    patternCache.set(cacheKey, compiled);

    return compiled;
}

export function compileSponsorPattern(pattern: string, flags = ""): RegExp | null {
    const source = pattern?.trim();
    if (!source) return null;

    // 缓存的正则跨文本复用，移除会推进 lastIndex 的标志，保证 test() 结果不依赖调用顺序。
    const statelessFlags = sanitizeSponsorRegexFlags(flags).replace(/[gy]/g, "");
    return cacheCompiledPattern(`stateless\u0000${statelessFlags}\u0000${source}`, () =>
        new RegExp(source, statelessFlags)
    );
}

/** 收集全部命中的全局正则与 test() 使用的正则分开缓存。 */
function compileGlobalSponsorPattern(regex: RegExp): RegExp | null {
    const flags = `${sanitizeSponsorRegexFlags(regex.flags).replace(/[gy]/g, "")}g`;
    return cacheCompiledPattern(`global\u0000${flags}\u0000${regex.source}`, () => new RegExp(regex.source, flags));
}

function collectMatches(text: string, regex: RegExp, global: boolean): string[] {
    // 全局 match 会重置 lastIndex，因此缓存的全局正则可跨文本复用。
    const matcher = global ? compileGlobalSponsorPattern(regex) : regex;
    if (!matcher) return [];

    const matches = text.match(matcher) ?? [];
    if (matches.length === 0) return [];

    return global ? matches : [matches[0]];
}

/** 阈值按去重后的匹配文本数计算；过滤长度小于 MIN_MATCH_LENGTH 的命中。 */
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
