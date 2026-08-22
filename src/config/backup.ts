import type { BackendConfigStorageDocument, BackendSubscriptionStorage } from "../config";
import { validateBackendConfigDocument } from "../backends/validator";

export type BackupRecord = Record<string, unknown>;

export interface BackendSettingsBackup {
    backendConfig: BackendConfigStorageDocument;
    backendEnabledMap: Record<string, boolean>;
    backendSubscription: Pick<BackendSubscriptionStorage, "url" | "intervalMinutes" | "enabled">;
}

export interface BackendRuntimeBackup {
    lastSyncAt: number | null;
    lastError: string | null;
    lastSubmissionBackendId: string | null;
}

export interface ParsedOptionsBackup {
    sync: BackupRecord;
    backendSettings?: BackendSettingsBackup;
}

export interface ParsedOtherDataBackup {
    local: BackupRecord;
    backendRuntime?: BackendRuntimeBackup;
}

const BACKEND_SETTING_KEYS = ["backendConfig", "backendEnabledMap", "backendSubscription"];
const BACKEND_RUNTIME_KEYS = ["lastSyncAt", "lastError", "lastSubmissionBackendId"];

function isRecord(value: unknown): value is BackupRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function parseInput(value: string | unknown): BackupRecord {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!isRecord(parsed)) throw new Error("backup must be a JSON object");
    return parsed;
}

function validateExactKeys(value: BackupRecord, keys: readonly string[], path: string): void {
    const unknownKeys = Object.keys(value).filter((key) => !keys.includes(key));
    if (unknownKeys.length > 0) throw new Error(`${path} contains unknown field(s): ${unknownKeys.join(", ")}`);
}

function validateBackendSettings(value: unknown): BackendSettingsBackup {
    if (!isRecord(value)) throw new Error("backendSettings must be an object");
    validateExactKeys(value, BACKEND_SETTING_KEYS, "backendSettings");

    const configResult = validateBackendConfigDocument(value.backendConfig);
    if (!configResult.valid) throw new Error(configResult.errors.join("; "));

    if (!isRecord(value.backendEnabledMap)) throw new Error("backendSettings.backendEnabledMap must be an object");
    for (const [id, enabled] of Object.entries(value.backendEnabledMap)) {
        if (typeof enabled !== "boolean") {
            throw new Error(`backendSettings.backendEnabledMap.${id} must be a boolean`);
        }
    }

    if (!isRecord(value.backendSubscription)) {
        throw new Error("backendSettings.backendSubscription must be an object");
    }
    validateExactKeys(value.backendSubscription, ["url", "intervalMinutes", "enabled"], "backendSubscription");
    if (typeof value.backendSubscription.url !== "string") {
        throw new Error("backendSettings.backendSubscription.url must be a string");
    }
    if (
        typeof value.backendSubscription.intervalMinutes !== "number" ||
        !Number.isFinite(value.backendSubscription.intervalMinutes) ||
        value.backendSubscription.intervalMinutes <= 0
    ) {
        throw new Error("backendSettings.backendSubscription.intervalMinutes must be a positive number");
    }
    if (typeof value.backendSubscription.enabled !== "boolean") {
        throw new Error("backendSettings.backendSubscription.enabled must be a boolean");
    }

    return clone(value as unknown as BackendSettingsBackup);
}

function validateBackendRuntime(value: unknown): BackendRuntimeBackup {
    if (!isRecord(value)) throw new Error("backendRuntime must be an object");
    validateExactKeys(value, BACKEND_RUNTIME_KEYS, "backendRuntime");
    if (value.lastSyncAt !== null && (typeof value.lastSyncAt !== "number" || !Number.isFinite(value.lastSyncAt))) {
        throw new Error("backendRuntime.lastSyncAt must be a finite number or null");
    }
    if (value.lastError !== null && typeof value.lastError !== "string") {
        throw new Error("backendRuntime.lastError must be a string or null");
    }
    if (value.lastSubmissionBackendId !== null && typeof value.lastSubmissionBackendId !== "string") {
        throw new Error("backendRuntime.lastSubmissionBackendId must be a string or null");
    }
    return clone(value as unknown as BackendRuntimeBackup);
}

function omit(record: BackupRecord, key: string): BackupRecord {
    const result = { ...record };
    delete result[key];
    return result;
}

export function createOptionsBackup<T extends object, U extends object>(syncConfig: T, localStorage: U): BackupRecord {
    const local = localStorage as U & BackupRecord;
    const localSubscription = local.backendSubscription as BackendSubscriptionStorage;
    return {
        ...clone(syncConfig),
        backendSettings: {
            backendConfig: clone(local.backendConfig as BackendConfigStorageDocument),
            backendEnabledMap: clone(local.backendEnabledMap as Record<string, boolean>),
            backendSubscription: {
                url: localSubscription.url,
                intervalMinutes: localSubscription.intervalMinutes,
                enabled: localSubscription.enabled,
            },
        } satisfies BackendSettingsBackup,
    };
}

export function createOtherDataBackup<T extends object>(localStorage: T): BackupRecord {
    const local = localStorage as T & BackupRecord;
    const localSubscription = local.backendSubscription as BackendSubscriptionStorage;
    const otherData = { ...local };
    delete otherData.backendConfig;
    delete otherData.backendEnabledMap;
    delete otherData.backendSubscription;
    delete otherData.lastSubmissionBackendId;

    return {
        ...clone(otherData),
        backendRuntime: {
            lastSyncAt: localSubscription.lastSyncAt ?? null,
            lastError: localSubscription.lastError ?? null,
            lastSubmissionBackendId: (local.lastSubmissionBackendId as string | null) ?? null,
        } satisfies BackendRuntimeBackup,
    };
}

export function parseOptionsBackup(value: string | unknown): ParsedOptionsBackup {
    const parsed = parseInput(value);
    if (!Object.prototype.hasOwnProperty.call(parsed, "backendSettings")) {
        return { sync: clone(parsed) };
    }

    const backendSettings = validateBackendSettings(parsed.backendSettings);
    return { sync: clone(omit(parsed, "backendSettings")), backendSettings };
}

export function parseOtherDataBackup(value: string | unknown): ParsedOtherDataBackup {
    const parsed = parseInput(value);
    if (!Object.prototype.hasOwnProperty.call(parsed, "backendRuntime")) {
        return { local: clone(parsed) };
    }

    for (const key of ["backendConfig", "backendEnabledMap", "backendSubscription", "lastSubmissionBackendId"]) {
        if (Object.prototype.hasOwnProperty.call(parsed, key)) {
            throw new Error(`new other data backup must not contain ${key}`);
        }
    }
    const backendRuntime = validateBackendRuntime(parsed.backendRuntime);
    return { local: clone(omit(parsed, "backendRuntime")), backendRuntime };
}
