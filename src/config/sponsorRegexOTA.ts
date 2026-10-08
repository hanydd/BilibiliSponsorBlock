import * as CompileConfig from "../../config.json";
import * as shippedSponsorRegexFile from "../../config/sponsorRegex.json";
import Config from "../config";
import { DynamicSponsorRegexRule, formatSponsorRuleDate } from "../utils/sponsorRegex";

/**
 * 词条默认值放在仓库根目录的 config/sponsorRegex.json 里：随扩展发布的版本作为初始值，
 * 因此调整词条只需要推送该文件，不需要发新版本。
 *
 * 默认词条只写本地（sponsorRegexRemoteConfig，不参与同步）；用户改过的词条写同步存储
 * （dynamicAndCommentSponsorRegexUserRules），生效时按 id 优先取用户版本。
 *
 * 每条词条自带 version：应用在线配置时逐条比较，只有远端 version 更高（或本地没有的新词条）
 * 才采用远端内容。因此在线配置**删除**词条时必须同时递增至少一条词条的 version，
 * 否则已应用过快照的客户端不会重写快照，被删掉的词条会继续生效。
 */

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

export interface SponsorRegexRemoteConfig {
    rules: DynamicSponsorRegexRule[];
}

export type SponsorRegexCheckStatus = "updated" | "up-to-date" | "failed";

export interface SponsorRegexCheckResult {
    status: SponsorRegexCheckStatus;
}

const CHECK_INTERVAL = 24 * 60 * 60 * 1000;
/** 检查失败后用更短的间隔重试，避免临时故障或镜像不可用占满一整个周期 */
const RETRY_INTERVAL = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT = 10_000;
const MAX_RULES = 200;
const MAX_PATTERN_LENGTH = 4000;
const MIN_RULE_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
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

function isRule(value: unknown): value is Rule {
    if (!isRecord(value)) return false;
    const rule = value as unknown as Rule;
    return (
        typeof rule.id === "string" &&
        /^[\w-]+$/.test(rule.id) &&
        isRecord(rule.locales) &&
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
    );
}

async function fetchRulesConfig(url: string): Promise<RulesConfig> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
        const response = await fetch(url, { cache: "no-cache", signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const config: unknown = await response.json();
        if (!isRulesConfig(config)) throw new Error("Invalid sponsor regex config");
        return config;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * 按顺序尝试各个源。前面的源（CDN）可能缓存着旧内容，没有更新时继续看下一个源，
 * 避免一份陈旧但格式正确的响应挡住更新的镜像；全部源都没有更新才算已是最新。
 */
async function applyRulesConfigFromSources(): Promise<SponsorRegexCheckResult> {
    const urls: string[] = CompileConfig.sponsorRegexConfigUrls ?? [];

    let fetched = false;
    for (const url of urls) {
        try {
            const result = applyRulesConfig(await fetchRulesConfig(url));
            fetched = true;
            if (result.status === "updated") return result;
        } catch {
            // 单个源失败（离线、镜像不可用、内容非法）时继续尝试下一个
        }
    }

    return { status: fetched ? "up-to-date" : "failed" };
}

export function applyRulesConfig(remote: RulesConfig): SponsorRegexCheckResult {
    const { byId } = getDefaultRules();

    let updated = false;
    const rules = remote.rules.map((rule) => {
        const local = byId.get(rule.id);
        if (local && (local.version ?? 0) >= rule.version) return { ...local };

        updated = true;
        return { ...rule };
    });

    if (!updated) return { status: "up-to-date" };

    Config.local.sponsorRegexRemoteConfig = { rules };

    return { status: "updated" };
}

interface DefaultRules {
    remote: SponsorRegexRemoteConfig | null;
    rules: DynamicSponsorRegexRule[];
    byId: Map<string, DynamicSponsorRegexRule>;
    latestUpdateDate: string | undefined;
}

let defaultRules: DefaultRules | null = null;

/** 随扩展发布的初始配置（config/sponsorRegex.json）；共享引用，运行期不得改写其中的词条 */
const shippedSponsorRegexRules: DynamicSponsorRegexRule[] = shippedSponsorRegexFile.rules;

/** 默认词条：已应用过在线配置则用在线版本，否则用扩展内置版本；按快照对象身份缓存 */
function getDefaultRules(): DefaultRules {
    const remote = Config.local?.sponsorRegexRemoteConfig ?? null;
    if (defaultRules?.remote === remote) return defaultRules;

    const rules = remote ? remote.rules.map((rule) => ({ ...rule })) : shippedSponsorRegexRules;
    const dates = rules
        .map((rule) => formatSponsorRuleDate(rule.updateAt))
        .filter((date): date is string => Boolean(date))
        .sort();

    defaultRules = {
        remote,
        rules,
        byId: new Map(rules.map((rule) => [rule.id, rule])),
        latestUpdateDate: dates.pop(),
    };

    return defaultRules;
}

export function getDefaultSponsorRegexRules(): DynamicSponsorRegexRule[] {
    return getDefaultRules().rules;
}

/** 默认词条里指定 id 的那一条；有值表示设置页只能重置、不能删除 */
export function getBuiltinSponsorRegexRule(ruleId: string): DynamicSponsorRegexRule | undefined {
    return getDefaultRules().byId.get(ruleId);
}

/** 生效默认词条里最近一次更新的日期（YYYY-MM-DD），用于设置页展示 */
export function getLatestDefaultUpdateDate(): string | undefined {
    return getDefaultRules().latestUpdateDate;
}

/** 用户改过的词条（改过的内置词条 + 自建词条），生效时按 id 优先于默认词条 */
export function getUserSponsorRegexRules(): DynamicSponsorRegexRule[] {
    return Config.config?.dynamicAndCommentSponsorRegexUserRules ?? [];
}

/** 保存用户改过的词条（写同步存储，可跨设备） */
export function setUserSponsorRegexRules(rules: DynamicSponsorRegexRule[]): void {
    Config.config.dynamicAndCommentSponsorRegexUserRules = rules;
}

interface EffectiveRulesCache {
    userRules: DynamicSponsorRegexRule[];
    remote: SponsorRegexRemoteConfig | null;
    rules: DynamicSponsorRegexRule[];
}

let effectiveRulesCache: EffectiveRulesCache | null = null;

export function getEffectiveSponsorRegexRules(): DynamicSponsorRegexRule[] {
    const userRules = getUserSponsorRegexRules();
    const remote = Config.local?.sponsorRegexRemoteConfig ?? null;

    // 内容页每条动态都会调用，按配置对象身份缓存，避免反复复制全部词条
    if (effectiveRulesCache?.userRules === userRules && effectiveRulesCache.remote === remote) {
        return effectiveRulesCache.rules;
    }

    const userById = new Map(userRules.map((rule) => [rule.id, rule]));
    const defaults = getDefaultRules();

    // 默认词条保持原顺序与元数据，用户版本只覆盖改过的字段；
    // 默认词条里没有的（自建词条）追加在后面
    const merged = defaults.rules.map((rule) => {
        const user = userById.get(rule.id);
        return user ? { ...rule, ...user } : rule;
    });
    const customRules = userRules.filter((rule) => !defaults.byId.has(rule.id));

    const rules = [...merged, ...customRules];
    effectiveRulesCache = { userRules, remote, rules };

    return rules;
}

/** 检查并应用在线词条配置；后台按 CHECK_INTERVAL 节流（上次失败则用更短的 RETRY_INTERVAL），设置页手动检查传 force */
export async function checkSponsorRegexConfigUpdate(force = false): Promise<SponsorRegexCheckResult> {
    const interval = Config.local?.lastSponsorRegexConfigCheckFailed ? RETRY_INTERVAL : CHECK_INTERVAL;
    if (!force && Date.now() - (Config.local?.lastSponsorRegexConfigCheck ?? 0) < interval) {
        return { status: "up-to-date" };
    }

    const result = await applyRulesConfigFromSources();

    Config.local.lastSponsorRegexConfigCheck = Date.now();
    Config.local.lastSponsorRegexConfigCheckFailed = result.status === "failed";

    return result;
}
