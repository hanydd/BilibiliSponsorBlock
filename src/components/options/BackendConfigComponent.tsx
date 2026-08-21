import * as React from "react";

import Config from "../../config";
import {
    BackendConfigService as ConfigBackendConfigService,
    validateBackendConfigDocument,
} from "../../config/backendConfigService";

export interface BackendConfig {
    id: string;
    name: string;
    desc?: string;
    api_url: string;
    capabilities?: string[];
    match?: unknown[];
    mirrors?: string[];
    conflicts?: string[];
}

export interface BackendConfigDocument {
    backends: BackendConfig[];
}

export interface BackendSubscription {
    url: string;
    intervalMinutes: number;
    enabled: boolean;
}

export interface BackendConfigState {
    backendConfig: BackendConfigDocument;
    backendEnabledMap: Record<string, boolean>;
    backendSubscription: BackendSubscription;
}

/** Replaceable UI contract for the backend config service. */
export interface BackendConfigService {
    getState: () => BackendConfigState | Promise<BackendConfigState>;
    validateAndNormalize: (value: string | unknown) => BackendConfigDocument | Promise<BackendConfigDocument>;
    saveConfig: (config: BackendConfigDocument) => void | Promise<void>;
    restoreDefault: () => BackendConfigDocument | Promise<BackendConfigDocument>;
    syncNow: (url: string) => BackendConfigDocument | void | Promise<BackendConfigDocument | void>;
    saveSubscription: (subscription: BackendSubscription) => void | Promise<void>;
    setBackendEnabled: (id: string, enabled: boolean) => void | Promise<void>;
}

interface RuntimeConfig {
    local?: Partial<BackendConfigState> | null;
    localDefaults?: Partial<BackendConfigState>;
}

interface BackendConfigComponentProps {
    onStateChange?: () => void;
}

interface BackendConfigComponentState extends BackendConfigState {
    configText: string;
    error: string;
    status: string;
    saving: boolean;
    syncing: boolean;
}

const DEFAULT_SUBSCRIPTION: BackendSubscription = {
    url: "",
    intervalMinutes: 60,
    enabled: false,
};

function getRuntimeConfig(): RuntimeConfig {
    return Config as unknown as RuntimeConfig;
}

function cloneConfig(config: BackendConfigDocument): BackendConfigDocument {
    return JSON.parse(JSON.stringify(config)) as BackendConfigDocument;
}

function formatConfig(config: BackendConfigDocument): string {
    return JSON.stringify(config, null, 4);
}

function fallbackState(): BackendConfigState {
    const local = getRuntimeConfig().local || {};
    const config = isConfigDocument(local.backendConfig) ? cloneConfig(local.backendConfig) : { backends: [] };
    const enabledMap = { ...(local.backendEnabledMap || {}) };
    const subscription = {
        ...DEFAULT_SUBSCRIPTION,
        ...(local.backendSubscription || {}),
    };

    return {
        backendConfig: config,
        backendEnabledMap: enabledMap,
        backendSubscription: {
            url: subscription.url || "",
            intervalMinutes: normalizeInterval(subscription.intervalMinutes),
            enabled: Boolean(subscription.enabled),
        },
    };
}

function isConfigDocument(value: unknown): value is BackendConfigDocument {
    return typeof value === "object" && value !== null && Array.isArray((value as { backends?: unknown }).backends);
}

function normalizeInterval(value: unknown): number {
    const interval = Number(value);
    return Number.isFinite(interval) && interval >= 1 ? interval : DEFAULT_SUBSCRIPTION.intervalMinutes;
}

async function requestSubscriptionHostPermission(value: string): Promise<boolean> {
    if (!chrome.permissions?.request) return true;
    try {
        const url = new URL(value);
        return await new Promise<boolean>((resolve) => {
            chrome.permissions.request({ origins: [`${url.protocol}//${url.host}/*`] }, resolve);
        });
    } catch {
        return false;
    }
}

function reconcileEnabledMap(config: BackendConfigDocument, enabledMap: Record<string, boolean>): Record<string, boolean> {
    return config.backends.reduce<Record<string, boolean>>((result, backend) => {
        result[backend.id] = enabledMap[backend.id] !== false;
        return result;
    }, {});
}

function createConfigServiceAdapter(): BackendConfigService {
    return {
        getState: () => {
            const local = getRuntimeConfig().local;
            const state = fallbackState();
            if (local?.backendConfig && isConfigDocument(local.backendConfig)) {
                state.backendConfig = cloneConfig(local.backendConfig);
            }
            if (local?.backendEnabledMap) state.backendEnabledMap = { ...local.backendEnabledMap };
            if (local?.backendSubscription) {
                state.backendSubscription = {
                    ...state.backendSubscription,
                    ...local.backendSubscription,
                    intervalMinutes: normalizeInterval(local.backendSubscription.intervalMinutes),
                };
            }
            state.backendEnabledMap = reconcileEnabledMap(state.backendConfig, state.backendEnabledMap);
            return state;
        },
        validateAndNormalize: (value: string | unknown) => {
            let parsed: unknown = value;
            if (typeof value === "string") {
                try {
                    parsed = JSON.parse(value);
                } catch {
                    throw new Error(chrome.i18n.getMessage("backendConfigInvalidJson"));
                }
            }
            const validation = validateBackendConfigDocument(parsed);
            if (!validation.valid) throw new Error(validation.errors.join("\n"));
            return cloneConfig(parsed as BackendConfigDocument);
        },
        saveConfig: (config: BackendConfigDocument) => {
            const result = ConfigBackendConfigService.applyDocument(config, "manual");
            if (!result.valid) throw new Error(result.errors.join("\n"));
        },
        restoreDefault: () => {
            const defaultConfig = getRuntimeConfig().localDefaults?.backendConfig;
            if (!isConfigDocument(defaultConfig)) throw new Error(chrome.i18n.getMessage("backendConfigEmpty"));
            const result = ConfigBackendConfigService.applyDocument(defaultConfig, "default");
            if (!result.valid) throw new Error(result.errors.join("\n"));
            return cloneConfig(defaultConfig);
        },
        syncNow: async (url: string) => {
            ConfigBackendConfigService.setSubscription({ url });
            const result = await ConfigBackendConfigService.syncFromUrl();
            if (!result.valid) throw new Error(result.errors.join("\n"));
        },
        saveSubscription: (subscription: BackendSubscription) => {
            ConfigBackendConfigService.setSubscription(subscription);
        },
        setBackendEnabled: (id: string, enabled: boolean) => {
            ConfigBackendConfigService.setBackendEnabled(id, enabled);
        },
    };
}

function getService(): BackendConfigService {
    return createConfigServiceAdapter();
}

function stateFromRuntime(): BackendConfigState {
    return fallbackState();
}

function backendStateFromServiceResult(result: unknown, fallback: BackendConfigState): BackendConfigState {
    if (!result || typeof result !== "object") return fallback;
    const value = result as Partial<BackendConfigState>;
    return {
        backendConfig: isConfigDocument(value.backendConfig) ? cloneConfig(value.backendConfig) : fallback.backendConfig,
        backendEnabledMap: value.backendEnabledMap ? { ...value.backendEnabledMap } : fallback.backendEnabledMap,
        backendSubscription: {
            ...fallback.backendSubscription,
            ...(value.backendSubscription || {}),
            intervalMinutes: normalizeInterval(value.backendSubscription?.intervalMinutes),
        },
    };
}

async function loadState(service: BackendConfigService): Promise<BackendConfigState> {
    const fallback = stateFromRuntime();
    return backendStateFromServiceResult(await service.getState(), fallback);
}

async function saveSubscription(service: BackendConfigService, subscription: BackendSubscription): Promise<void> {
    await service.saveSubscription(subscription);
}

async function saveEnabledMap(
    service: BackendConfigService,
    config: BackendConfigDocument,
    map: Record<string, boolean>
): Promise<void> {
    const reconciled = reconcileEnabledMap(config, map);
    await Promise.all(config.backends.map((backend) => service.setBackendEnabled(backend.id, reconciled[backend.id])));
}

export default class BackendConfigComponent extends React.Component<
    BackendConfigComponentProps,
    BackendConfigComponentState
> {
    private readonly service: BackendConfigService;

    constructor(props: BackendConfigComponentProps) {
        super(props);
        const initial = stateFromRuntime();
        this.service = getService();
        this.state = {
            ...initial,
            configText: formatConfig(initial.backendConfig),
            error: "",
            status: "",
            saving: false,
            syncing: false,
        };
    }

    componentDidMount(): void {
        void this.refresh();
    }

    async refresh(): Promise<void> {
        try {
            const loaded = await loadState(this.service);
            this.setState({
                ...loaded,
                configText: formatConfig(loaded.backendConfig),
                error: "",
            });
        } catch (error) {
            this.setState({ error: error instanceof Error ? error.message : String(error) });
        }
    }

    async validate(value: string): Promise<BackendConfigDocument> {
        return this.service.validateAndNormalize(value);
    }

    async handleSaveConfig(): Promise<void> {
        this.setState({ saving: true, error: "", status: "" });
        try {
            const config = await this.validate(this.state.configText);
            await this.service.saveConfig(config);
            const subscription = { ...this.state.backendSubscription, enabled: false };
            await saveSubscription(this.service, subscription);

            const enabledMap = reconcileEnabledMap(config, this.state.backendEnabledMap);
            await saveEnabledMap(this.service, config, enabledMap);
            this.setState({
                backendConfig: config,
                backendEnabledMap: enabledMap,
                backendSubscription: subscription,
                configText: formatConfig(config),
                status: chrome.i18n.getMessage("backendConfigSaved"),
                saving: false,
            });
            this.props.onStateChange?.();
        } catch (error) {
            this.setState({
                error: error instanceof Error ? error.message : String(error),
                saving: false,
                status: "",
            });
        }
    }

    async handleRestoreDefault(): Promise<void> {
        this.setState({ saving: true, error: "", status: "" });
        try {
            const restored = await this.service.restoreDefault();
            const config = await this.validate(formatConfig(restored));
            const subscription = { ...this.state.backendSubscription, enabled: false };
            await saveSubscription(this.service, subscription);
            const enabledMap = reconcileEnabledMap(config, this.state.backendEnabledMap);
            await saveEnabledMap(this.service, config, enabledMap);
            this.setState({
                backendConfig: config,
                backendEnabledMap: enabledMap,
                backendSubscription: subscription,
                configText: formatConfig(config),
                status: chrome.i18n.getMessage("backendConfigRestored"),
                saving: false,
            });
            this.props.onStateChange?.();
        } catch (error) {
            this.setState({
                error: error instanceof Error ? error.message : String(error),
                saving: false,
                status: "",
            });
        }
    }

    async handleSync(): Promise<void> {
        const url = this.state.backendSubscription.url.trim();
        if (!url) {
            this.setState({ error: chrome.i18n.getMessage("backendSubscriptionUrlRequired"), status: "" });
            return;
        }

        if (!(await requestSubscriptionHostPermission(url))) {
            this.setState({ error: chrome.i18n.getMessage("backendSubscriptionPermissionDenied"), status: "" });
            return;
        }

        this.setState({ syncing: true, error: "", status: "" });
        try {
            const synced = await this.service.syncNow(url);
            const loaded = synced && isConfigDocument(synced) ? synced : await loadState(this.service);
            const config = isConfigDocument(loaded) ? loaded : loaded.backendConfig;
            const state = isConfigDocument(loaded) ? await loadState(this.service) : loaded;
            this.setState({
                backendConfig: config,
                backendEnabledMap: reconcileEnabledMap(config, state.backendEnabledMap),
                configText: formatConfig(config),
                syncing: false,
                status: chrome.i18n.getMessage("backendConfigSynced"),
            });
            this.props.onStateChange?.();
        } catch (error) {
            this.setState({
                error: error instanceof Error ? error.message : String(error),
                syncing: false,
                status: "",
            });
        }
    }

    async handleSubscriptionChange(changes: Partial<BackendSubscription>): Promise<void> {
        const subscription = {
            ...this.state.backendSubscription,
            ...changes,
            intervalMinutes: normalizeInterval(changes.intervalMinutes ?? this.state.backendSubscription.intervalMinutes),
        };
        if (changes.enabled && subscription.url && !(await requestSubscriptionHostPermission(subscription.url))) {
            this.setState({ error: chrome.i18n.getMessage("backendSubscriptionPermissionDenied"), status: "" });
            return;
        }
        this.setState({ backendSubscription: subscription });
        try {
            await saveSubscription(this.service, subscription);
        } catch (error) {
            this.setState({ error: error instanceof Error ? error.message : String(error) });
        }
    }

    async handleJsonChange(value: string): Promise<void> {
        this.setState({ configText: value, status: "", error: "" });
        if (this.state.backendSubscription.enabled) {
            await this.handleSubscriptionChange({ enabled: false });
        }
    }

    async handleBackendEnabled(id: string, enabled: boolean): Promise<void> {
        const backendEnabledMap = { ...this.state.backendEnabledMap, [id]: enabled };
        this.setState({ backendEnabledMap, error: "", status: "" });
        try {
            await this.service.setBackendEnabled(id, enabled);
        } catch (error) {
            this.setState({ error: error instanceof Error ? error.message : String(error) });
        }
    }

    render(): React.ReactElement {
        const { backendConfig, backendEnabledMap, backendSubscription } = this.state;
        return (
            <div className="backend-config-component">
                <h2>{chrome.i18n.getMessage("backendConfigTitle")}</h2>
                <p className="small-description backend-config-description">
                    {chrome.i18n.getMessage("backendConfigDescription")}
                </p>

                <div className="backend-subscription-panel">
                    <h3>{chrome.i18n.getMessage("backendSubscriptionTitle")}</h3>
                    <label className="backend-config-field">
                        <span>{chrome.i18n.getMessage("backendSubscriptionUrl")}</span>
                        <input
                            className="option-text-box backend-subscription-url"
                            type="url"
                            value={backendSubscription.url}
                            onChange={(event) => this.handleSubscriptionChange({ url: event.target.value })}
                        />
                    </label>
                    <label className="backend-config-field">
                        <span>{chrome.i18n.getMessage("backendSubscriptionInterval")}</span>
                        <input
                            type="number"
                            min="1"
                            step="1"
                            value={backendSubscription.intervalMinutes}
                            onChange={(event) =>
                                this.handleSubscriptionChange({ intervalMinutes: Number(event.target.value) })
                            }
                        />
                        <span>{chrome.i18n.getMessage("backendSubscriptionMinutes")}</span>
                    </label>
                    <div className="switch-container backend-subscription-switch">
                        <label className="switch">
                            <input
                                id="backendSubscriptionEnabled"
                                type="checkbox"
                                checked={backendSubscription.enabled}
                                onChange={(event) => this.handleSubscriptionChange({ enabled: event.target.checked })}
                            />
                            <span className="slider round"></span>
                        </label>
                        <label className="switch-label" htmlFor="backendSubscriptionEnabled">
                            {chrome.i18n.getMessage("backendSubscriptionEnabled")}
                        </label>
                    </div>
                    <button
                        className="option-button backend-config-button"
                        type="button"
                        disabled={this.state.syncing}
                        onClick={() => void this.handleSync()}
                    >
                        {this.state.syncing
                            ? chrome.i18n.getMessage("backendSubscriptionSyncing")
                            : chrome.i18n.getMessage("backendSubscriptionSyncNow")}
                    </button>
                </div>

                <div className="backend-json-editor">
                    <label htmlFor="backendConfigJson">{chrome.i18n.getMessage("backendConfigJsonLabel")}</label>
                    <textarea
                        id="backendConfigJson"
                        className="backend-config-textarea"
                        value={this.state.configText}
                        spellCheck={false}
                        onChange={(event) => void this.handleJsonChange(event.target.value)}
                    />
                    <div className="backend-config-actions">
                        <button
                            className="option-button"
                            type="button"
                            disabled={this.state.saving}
                            onClick={() => void this.handleSaveConfig()}
                        >
                            {chrome.i18n.getMessage("backendConfigSave")}
                        </button>
                        <button
                            className="option-button backend-config-secondary-button"
                            type="button"
                            disabled={this.state.saving}
                            onClick={() => void this.handleRestoreDefault()}
                        >
                            {chrome.i18n.getMessage("backendConfigRestoreDefault")}
                        </button>
                    </div>
                </div>

                {(this.state.error || this.state.status) && (
                    <div className={`backend-config-message ${this.state.error ? "error" : "success"}`} role="status">
                        {this.state.error || this.state.status}
                    </div>
                )}

                <div className="backend-config-table-wrapper">
                    <table className="backend-config-table">
                        <thead>
                            <tr>
                                <th>{chrome.i18n.getMessage("backendConfigId")}</th>
                                <th>{chrome.i18n.getMessage("backendConfigName")}</th>
                                <th>{chrome.i18n.getMessage("backendConfigDescriptionColumn")}</th>
                                <th>{chrome.i18n.getMessage("backendConfigApiUrl")}</th>
                                <th>{chrome.i18n.getMessage("backendConfigEnabled")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {backendConfig.backends.map((backend) => (
                                <tr key={backend.id}>
                                    <td>{backend.id}</td>
                                    <td>{backend.name}</td>
                                    <td>{backend.desc || ""}</td>
                                    <td className="backend-config-api-url">{backend.api_url}</td>
                                    <td>
                                        <label className="switch">
                                            <input
                                                type="checkbox"
                                                checked={backendEnabledMap[backend.id] !== false}
                                                onChange={(event) =>
                                                    void this.handleBackendEnabled(backend.id, event.target.checked)
                                                }
                                            />
                                            <span className="slider round"></span>
                                        </label>
                                    </td>
                                </tr>
                            ))}
                            {backendConfig.backends.length === 0 && (
                                <tr>
                                    <td className="backend-config-empty" colSpan={5}>
                                        {chrome.i18n.getMessage("backendConfigEmpty")}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }
}
