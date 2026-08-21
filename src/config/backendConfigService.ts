import Config, {
    BackendConfigStorageDocument,
    BackendSubscriptionStorage,
} from "../config";
import { getDefaultBackendConfig } from "../backends/runtime";
import { validateBackendConfigDocument as validateCanonicalBackendConfigDocument } from "../backends/validator";

export type BackendConfigSource = "default" | "manual" | "subscription";

export interface BackendConfigValidationResult {
    valid: boolean;
    errors: string[];
}

export function validateBackendConfigDocument(document: unknown): BackendConfigValidationResult {
    return validateCanonicalBackendConfigDocument(document);
}

function cloneDocument(document: BackendConfigStorageDocument): BackendConfigStorageDocument {
    return JSON.parse(JSON.stringify(document)) as BackendConfigStorageDocument;
}

function reconcileEnabledMap(document: BackendConfigStorageDocument, existing: Record<string, boolean>): Record<string, boolean> {
    return Object.fromEntries(document.backends.map((backend) => [backend.id, existing[backend.id] !== false]));
}

export const BackendConfigService = {
    async getState() {
        return {
            backendConfig: this.getDocument(),
            backendEnabledMap: { ...(Config.local.backendEnabledMap ?? {}) },
            backendSubscription: this.getSubscription(),
        };
    },

    validateAndNormalize(value: string | unknown): BackendConfigStorageDocument {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        const validation = validateBackendConfigDocument(parsed);
        if (!validation.valid) throw new Error(validation.errors.join("; "));
        return cloneDocument(parsed as BackendConfigStorageDocument);
    },

    getDocument(): BackendConfigStorageDocument {
        return cloneDocument(Config.local.backendConfig);
    },

    getSubscription(): BackendSubscriptionStorage {
        return { ...Config.local.backendSubscription };
    },

    applyDocument(document: unknown, source: BackendConfigSource): BackendConfigValidationResult {
        const validation = validateBackendConfigDocument(document);
        if (!validation.valid) return validation;

        const next = cloneDocument(document as BackendConfigStorageDocument);
        Config.local.backendConfig = next;
        Config.local.backendEnabledMap = reconcileEnabledMap(next, Config.local.backendEnabledMap ?? {});
        if (source === "manual") {
            Config.local.backendSubscription = { ...Config.local.backendSubscription, enabled: false };
            if (chrome.alarms) void chrome.alarms.clear("backend-config-sync");
        }
        Config.forceLocalUpdate("backendConfig");
        Config.forceLocalUpdate("backendEnabledMap");
        if (source === "manual") Config.forceLocalUpdate("backendSubscription");
        return { valid: true, errors: [] };
    },

    async saveConfig(document: BackendConfigStorageDocument): Promise<void> {
        const result = this.applyDocument(document, "manual");
        if (!result.valid) throw new Error(result.errors.join("; "));
    },

    restoreDefault(): BackendConfigStorageDocument {
        return getDefaultBackendConfig() as unknown as BackendConfigStorageDocument;
    },

    setBackendEnabled(id: string, enabled: boolean): void {
        Config.local.backendEnabledMap = { ...Config.local.backendEnabledMap, [id]: enabled };
        Config.forceLocalUpdate("backendEnabledMap");
    },

    setSubscription(patch: Partial<BackendSubscriptionStorage>): void {
        const next = { ...Config.local.backendSubscription, ...patch };
        Config.local.backendSubscription = next;
        Config.forceLocalUpdate("backendSubscription");
        if (chrome.alarms) {
            if (next.enabled && next.intervalMinutes > 0) {
                void chrome.alarms.create("backend-config-sync", { periodInMinutes: next.intervalMinutes });
            } else {
                void chrome.alarms.clear("backend-config-sync");
            }
        }
    },

    async syncFromUrl(): Promise<BackendConfigValidationResult> {
        const subscription = this.getSubscription();
        if (!subscription.url) return { valid: false, errors: ["subscription URL is empty"] };
        try {
            const response = await fetch(subscription.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = this.applyDocument(await response.json(), "subscription");
            Config.local.backendSubscription = {
                ...Config.local.backendSubscription,
                lastSyncAt: result.valid ? Date.now() : Config.local.backendSubscription.lastSyncAt,
                lastError: result.valid ? null : result.errors.join("; "),
            };
            Config.forceLocalUpdate("backendSubscription");
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : "sync failed";
            Config.local.backendSubscription = { ...Config.local.backendSubscription, lastError: message };
            Config.forceLocalUpdate("backendSubscription");
            return { valid: false, errors: [message] };
        }
    },

    async syncNow(url: string): Promise<BackendConfigStorageDocument> {
        const previous = this.getSubscription();
        this.setSubscription({ url });
        const result = await this.syncFromUrl();
        this.setSubscription({ url: previous.url || url, enabled: previous.enabled });
        if (!result.valid) throw new Error(result.errors.join("; "));
        return this.getDocument();
    },

    async saveSubscription(subscription: BackendSubscriptionStorage): Promise<void> {
        this.setSubscription(subscription);
    },

    async setBackendEnabledMap(map: Record<string, boolean>): Promise<void> {
        Config.local.backendEnabledMap = { ...map };
        Config.forceLocalUpdate("backendEnabledMap");
    },

    setLastSubmissionBackendId(id: string | null): void {
        Config.local.lastSubmissionBackendId = id;
        Config.forceLocalUpdate("lastSubmissionBackendId");
    },
};

export default BackendConfigService;
