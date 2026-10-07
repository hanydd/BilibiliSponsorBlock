import * as CompileConfig from "../../config.json";
import * as shippedSponsorRegexFile from "../../config/sponsorRegex.json";
import Config from "../config";
import { DynamicSponsorRegexRule, formatSponsorRuleDate } from "../utils/sponsorRegex";

export interface Rule {
    id: string;
    locales: {
        en: string;
        zh_CN: string;
        zh_TW: string;
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

/** 本地缓存：已应用的在线词条（作为“用户未修改时的默认内容”基线） */
export interface SponsorRegexRemoteConfig {
    rules: DynamicSponsorRegexRule[];
    appliedAt: number;
}

export type SponsorRegexCheckStatus = "updated" | "up-to-date" | "failed";

export interface SponsorRegexCheckResult {
    status: SponsorRegexCheckStatus;
    updatedCount?: number;
}

const CHECK_INTERVAL = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT = 10_000;
const MAX_RULES = 200;
const MAX_PATTERN_LENGTH = 4000;
const MIN_RULE_VERSION = 1;
const MAX_RULE_VERSION = 1e9;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isUpdateAt(value: unknown): value is Rule["updateAt"] {
    if (!isPlainObject(value)) return false;
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

function isRule(value: unknown): value is Rule {
    if (!isPlainObject(value)) return false;
    const rule = value as unknown as Rule;
    return (
        typeof rule.id === "string" &&
        /^[\w-]+$/.test(rule.id) &&
        isPlainObject(rule.locales) &&
        [rule.locales.en, rule.locales.zh_CN, rule.locales.zh_TW].every(
            (name) => typeof name === "string" && name.trim() !== ""
        ) &&
        typeof rule.pattern === "string" &&
        rule.pattern.trim() !== "" &&
        rule.pattern.length <= MAX_PATTERN_LENGTH &&
        typeof rule.enabled === "boolean" &&
        typeof rule.version === "number" &&
        Number.isInteger(rule.version) &&
        rule.version >= MIN_RULE_VERSION &&
        rule.version <= MAX_RULE_VERSION &&
        isUpdateAt(rule.updateAt)
    );
}

export function isRulesConfig(value: unknown): value is RulesConfig {
    return (
        isPlainObject(value) &&
        Array.isArray(value.rules) &&
        value.rules.length > 0 &&
        value.rules.length <= MAX_RULES &&
        value.rules.every(isRule)
    );
}

async function fetchRulesConfig(): Promise<RulesConfig> {
    const urls: string[] = CompileConfig.sponsorRegexConfigUrls ?? [];
    if (urls.length === 0) throw new Error("No sponsor regex config url configured");

    let lastError: unknown = new Error("unreachable");
    for (const url of urls) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        try {
            const response = await fetch(url, { cache: "no-cache", signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const config: unknown = await response.json();
            if (!isRulesConfig(config)) throw new Error("Invalid sponsor regex config");
            return config;
        } catch (error) {
            lastError = error;
        } finally {
            clearTimeout(timeout);
        }
    }

    throw lastError;
}

export function mergeSponsorRegexRulesWithDefaults(
    userRules: DynamicSponsorRegexRule[],
    newDefaults: DynamicSponsorRegexRule[],
    oldDefaults: DynamicSponsorRegexRule[]
): DynamicSponsorRegexRule[] {
    const oldById = new Map(oldDefaults.map((rule) => [rule.id, rule]));
    const newIds = new Set(newDefaults.map((rule) => rule.id));

    const merged = newDefaults.map((def) => {
        const user = userRules.find((rule) => rule.id === def.id);
        const old = oldById.get(def.id);
        if (!user || !old) return { ...def };

        return {
            ...def,
            pattern: user.pattern !== old.pattern ? user.pattern : def.pattern,
            enabled: user.enabled !== old.enabled ? user.enabled : def.enabled,
        };
    });

    const keptUserRules = userRules.filter((rule) => {
        if (!newIds.has(rule.id) && !oldById.has(rule.id)) return true;
        return !newIds.has(rule.id) && rule.pattern !== oldById.get(rule.id)?.pattern;
    });

    return [...merged, ...keptUserRules];
}

export function applyRulesConfig(remote: RulesConfig): SponsorRegexCheckResult {
    const oldDefaults = getDefaultSponsorRegexRules();
    const oldById = new Map(oldDefaults.map((rule) => [rule.id, rule]));

    // 版本号更高的词条采用远端内容，其余保持本地已知默认值不变
    const newDefaults: DynamicSponsorRegexRule[] = [];
    let updatedCount = 0;
    for (const rule of remote.rules) {
        const old = oldById.get(rule.id);
        if (!old || rule.version > (old.version ?? 0)) {
            newDefaults.push({ ...rule });
            updatedCount++;
        } else {
            newDefaults.push({ ...old });
        }
    }

    if (updatedCount === 0) return { status: "up-to-date" };

    const userRules = Config.config.dynamicAndCommentSponsorRegexRules ?? [];
    Config.config.dynamicAndCommentSponsorRegexRules = mergeSponsorRegexRulesWithDefaults(
        userRules,
        newDefaults,
        oldDefaults
    );
    Config.local.sponsorRegexRemoteConfig = {
        rules: newDefaults.map((rule) => ({ ...rule })),
        appliedAt: Date.now(),
    };

    return { status: "updated", updatedCount };
}

/** 随扩展发布的初始配置 */
export function getShippedRulesConfig(): RulesConfig {
    return { rules: shippedSponsorRegexFile.rules.map((rule) => ({ ...rule })) };
}

/** 运行时生效的默认词条：已应用过在线配置则用在线版本，否则用扩展内置版本 */
export function getDefaultSponsorRegexRules(): DynamicSponsorRegexRule[] {
    const remote = Config.local?.sponsorRegexRemoteConfig;
    return remote ? remote.rules.map((rule) => ({ ...rule })) : getShippedRulesConfig().rules;
}

/** 生效默认词条里最近一次更新的日期（YYYY-MM-DD），用于设置页展示 */
export function getLatestDefaultUpdateDate(): string | undefined {
    const dates = getDefaultSponsorRegexRules()
        .map((rule) => rule.updateAt)
        .filter((date): date is NonNullable<DynamicSponsorRegexRule["updateAt"]> => Boolean(date))
        .map((date) => `${date.year * 10000 + date.month * 100 + date.day}@${formatSponsorRuleDate(date)}`)
        .sort();
    return dates.length ? dates[dates.length - 1].split("@")[1] : undefined;
}

/** 检查并应用在线词条配置；后台按 CHECK_INTERVAL 节流，设置页手动检查传 force */
export async function checkSponsorRegexConfigUpdate(force = false): Promise<SponsorRegexCheckResult> {
    const now = Date.now();
    if (!force && now - (Config.local?.lastSponsorRegexConfigCheck ?? 0) < CHECK_INTERVAL) {
        return { status: "up-to-date" };
    }

    Config.local.lastSponsorRegexConfigCheck = now;

    try {
        return applyRulesConfig(await fetchRulesConfig());
    } catch {
        return { status: "failed" };
    }
}
