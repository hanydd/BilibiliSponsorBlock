import * as shippedSponsorRegexFile from "../../ota/sponsorRegex.json";
import Config from "../config";
import { DynamicSponsorRegexRule, formatSponsorRuleDate } from "../utils/sponsorRegex";
export { Rule, RulesConfig, isRulesConfig } from "./sponsorRegexConfig";

/** 默认规则使用本地 OTA 快照或随包配置；用户规则单独同步，按 id 覆盖默认规则。 */

export interface SponsorRegexRemoteConfig {
    rules: DynamicSponsorRegexRule[];
}

export type SponsorRegexCheckStatus = "updated" | "up-to-date" | "failed";

export interface SponsorRegexCheckResult {
    status: SponsorRegexCheckStatus;
}

interface DefaultRules {
    remote: SponsorRegexRemoteConfig | null;
    rules: DynamicSponsorRegexRule[];
    byId: Map<string, DynamicSponsorRegexRule>;
    latestUpdateDate: string | undefined;
}

let defaultRules: DefaultRules | null = null;

/** 随包规则和 getter 返回值均为共享引用；修改时需复制，并通过 Config 替换配置引用。 */
const shippedSponsorRegexRules: DynamicSponsorRegexRule[] = shippedSponsorRegexFile.data.rules;

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

export function getBuiltinSponsorRegexRule(ruleId: string): DynamicSponsorRegexRule | undefined {
    return getDefaultRules().byId.get(ruleId);
}

export function getLatestDefaultUpdateDate(): string | undefined {
    return getDefaultRules().latestUpdateDate;
}

export function getUserSponsorRegexRules(): DynamicSponsorRegexRule[] {
    return Config.config?.dynamicAndCommentSponsorRegexUserRules ?? [];
}

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

    // 匹配会频繁读取生效规则；配置引用变化时才重新合并。
    if (effectiveRulesCache?.userRules === userRules && effectiveRulesCache.remote === remote) {
        return effectiveRulesCache.rules;
    }

    const userById = new Map(userRules.map((rule) => [rule.id, rule]));
    const defaults = getDefaultRules();

    // 用户记录中保存的字段优先；未保存的元数据从默认规则继承。
    const merged = defaults.rules.map((rule) => {
        const user = userById.get(rule.id);
        return user ? { ...rule, ...user } : rule;
    });
    const customRules = userRules.filter((rule) => !defaults.byId.has(rule.id));

    const rules = [...merged, ...customRules];
    effectiveRulesCache = { userRules, remote, rules };

    return rules;
}
