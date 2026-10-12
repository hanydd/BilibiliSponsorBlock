export interface Rule {
    id: string;
    name?: string;
    /** 必须提供 en，作为缺少当前界面语言时的名称回退。 */
    locales: {
        en: string;
        [locale: string]: string;
    };
    pattern: string;
    enabled: boolean;
    version: number;
    updateAt: {
        year: number;
        month: number;
        day: number;
    };
}

export interface RulesConfig {
    rules: Rule[];
}

const MAX_RULES = 200;
const MAX_PATTERN_LENGTH = 4000;
const MIN_RULE_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUpdateAt(value: unknown): value is Rule["updateAt"] {
    if (!isRecord(value)) return false;
    const { year, month, day } = value as unknown as Rule["updateAt"];
    return (
        [year, month, day].every((part) => typeof part === "number" && Number.isInteger(part)) &&
        year >= 2000 &&
        year <= 2100 &&
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= 31
    );
}

function isRuleLocales(value: unknown): value is Rule["locales"] {
    if (!isRecord(value)) return false;

    const { en, ...rest } = value;
    if (typeof en !== "string" || en.trim() === "") return false;

    return Object.values(rest).every((name) => typeof name === "string" && name.trim() !== "");
}

function isRule(value: unknown): value is Rule {
    if (!isRecord(value)) return false;
    const rule = value as unknown as Rule;
    try {
        if (typeof rule.pattern !== "string" || rule.pattern.length > MAX_PATTERN_LENGTH) return false;
        new RegExp(rule.pattern, "gi");
    } catch {
        return false;
    }
    return (
        typeof rule.id === "string" &&
        /^[\w-]+$/.test(rule.id) &&
        (rule.name === undefined || typeof rule.name === "string") &&
        isRuleLocales(rule.locales) &&
        typeof rule.pattern === "string" &&
        rule.pattern.trim() !== "" &&
        rule.pattern.length <= MAX_PATTERN_LENGTH &&
        typeof rule.enabled === "boolean" &&
        typeof rule.version === "number" &&
        Number.isInteger(rule.version) &&
        rule.version >= MIN_RULE_VERSION &&
        isUpdateAt(rule.updateAt)
    );
}

export function isRulesConfig(value: unknown): value is RulesConfig {
    return (
        isRecord(value) &&
        Array.isArray(value.rules) &&
        value.rules.length > 0 &&
        value.rules.length <= MAX_RULES &&
        value.rules.every(isRule)
        && new Set(value.rules.map((rule) => rule.id)).size === value.rules.length
    );
}
