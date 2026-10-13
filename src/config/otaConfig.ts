import { isRulesConfig } from "./sponsorRegexConfig";
import type { RulesConfig } from "./sponsorRegexConfig";
import { isOfficialServers } from "./officialServers";
import type { OfficialServers } from "./officialServers";

/** OTA 仅分发数据；新增配置类型的校验和应用逻辑需随扩展发布。 */
export interface OtaConfig {
    schemaVersion: 1;
    configs: Record<string, { schemaVersion: number; data: Record<string, unknown> }>;
}

export type ValidatedOtaConfig = OtaConfig & {
    configs: {
        sponsorRegex?: { schemaVersion: 1; data: RulesConfig };
        servers?: { schemaVersion: 1; data: OfficialServers };
    };
};

export const OTA_MAX_BYTES = 256 * 1024;
export const OTA_MAX_FILE_BYTES = 64 * 1024;
export const OTA_MAX_FILES = 32;

/** 已知配置类型必须通过业务校验；未知类型仅校验通用结构，供旧客户端兼容。 */
export function parseOtaConfig(text: string): ValidatedOtaConfig {
    if (new TextEncoder().encode(text).length > OTA_MAX_BYTES) throw new Error("OTA response too large");
    const value: unknown = JSON.parse(text);
    if (!isOtaConfig(value)) throw new Error("Invalid OTA config");
    const sponsorRegex = value.configs.sponsorRegex;
    if (sponsorRegex && (sponsorRegex.schemaVersion !== 1 || !isRulesConfig(sponsorRegex.data))) {
        throw new Error("Invalid sponsor regex config");
    }
    const servers = value.configs.servers;
    if (servers && (servers.schemaVersion !== 1 || !isOfficialServers(servers.data))) {
        throw new Error("Invalid official server config");
    }
    return value as ValidatedOtaConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasSafeKeys(value: unknown, depth = 0): boolean {
    if (depth > 32) return false;
    if (value === null || typeof value !== "object") return true;
    return Object.entries(value).every(([key, item]) =>
        !["__proto__", "prototype", "constructor"].includes(key) && hasSafeKeys(item, depth + 1)
    );
}

export function isOtaConfig(value: unknown): value is OtaConfig {
    if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.configs) || !hasSafeKeys(value)) return false;
    const entries = Object.entries(value.configs);
    return entries.length > 0 && entries.length <= OTA_MAX_FILES && entries.every(([name, config]) =>
        /^[a-z][a-zA-Z0-9]{0,63}$/.test(name) && isRecord(config) &&
        Number.isInteger(config.schemaVersion) && Number(config.schemaVersion) >= 1 && isRecord(config.data) &&
        new TextEncoder().encode(JSON.stringify(config)).length <= OTA_MAX_FILE_BYTES
    );
}
