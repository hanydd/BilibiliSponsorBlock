import { isFirefox } from "../utils/";

export interface SyncStorage {
    invidiousInstances: string[];
}

export interface LocalStorage {
    navigationApiAvailable: boolean;
}

interface StorageObjects<T, U> {
    sync: T;
    local: U;
}

export type StorageChangesObject = { [key: string]: chrome.storage.StorageChange };

export type Keybind = {
    key: string | null;
    code?: string | null;
    ctrl?: boolean | null;
    alt?: boolean | null;
    shift?: boolean | null;
};

export class ProtoConfig<T extends SyncStorage, U extends LocalStorage> {
    configLocalListeners: Array<(changes: StorageChangesObject) => unknown> = [];
    configSyncListeners: Array<(changes: StorageChangesObject) => unknown> = [];
    syncDefaults: T;
    localDefaults: U;
    cachedSyncConfig: T | null = null;
    cachedLocalStorage: U | null = null;
    config: T | null = null;
    local: U | null = null;
    inDeArrow = false;

    constructor(syncDefaults: T, localDefaults: U, migrateOldSyncFormats: (config: T) => void, inDeArrow = false) {
        this.syncDefaults = syncDefaults;
        this.localDefaults = localDefaults;
        this.inDeArrow = inDeArrow;

        void this.setupConfig(migrateOldSyncFormats).then((result) => {
            this.config = result?.sync;
            this.local = result?.local;
        });
    }

    configProxy(): StorageObjects<T, U> {
        chrome.storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }, areaName) => {
            if (areaName === "sync") {
                for (const key in changes) {
                    this.cachedSyncConfig![key] = changes[key].newValue;
                }

                for (const callback of this.configSyncListeners) {
                    callback(changes);
                }
            } else if (areaName === "local") {
                for (const key in changes) {
                    // skip bsb_cache
                    if (key.startsWith("bsb_cache")) {
                        continue;
                    }
                    this.cachedLocalStorage![key] = changes[key].newValue;
                }

                for (const callback of this.configLocalListeners) {
                    callback(changes);
                }
            }
        });

        let lastSet = 0;
        const nextToUpdate: Set<string> = new Set();
        let activeTimeout: NodeJS.Timeout | null = null;

        const self = this;
        const syncHandler: ProxyHandler<SyncStorage> = {
            set<K extends keyof SyncStorage>(obj: SyncStorage, prop: K, value: SyncStorage[K]) {
                self.cachedSyncConfig![prop] = value;

                if (Date.now() - lastSet < 100) {
                    nextToUpdate.add(prop);
                    if (!activeTimeout) {
                        const delayUpdate = () => {
                            const items = [...nextToUpdate];
                            nextToUpdate.clear();

                            void chrome.storage.sync.set(
                                items
                                    .map((v) => [v, self.cachedSyncConfig![v]])
                                    .reduce((acc, [k, v]) => {
                                        acc[k] = v;
                                        return acc;
                                    }, {})
                            );

                            activeTimeout = null;
                        };

                        activeTimeout = setTimeout(delayUpdate, 20);
                    }

                    return true;
                }

                void chrome.storage.sync.set({ [prop]: value });

                lastSet = Date.now();

                return true;
            },

            get<K extends keyof SyncStorage>(obj: SyncStorage, prop: K): SyncStorage[K] {
                const data = self.cachedSyncConfig![prop];

                return obj[prop] || data;
            },

            deleteProperty(obj: SyncStorage, prop: keyof SyncStorage) {
                void chrome.storage.sync.remove(<string>prop);

                return true;
            },
        };

        const localHandler: ProxyHandler<LocalStorage> = {
            set<K extends keyof LocalStorage>(obj: LocalStorage, prop: K, value: LocalStorage[K]) {
                self.cachedLocalStorage![prop] = value;

                void chrome.storage.local.set({ [prop]: value });

                return true;
            },

            get<K extends keyof LocalStorage>(obj: LocalStorage, prop: K): LocalStorage[K] {
                const data = self.cachedLocalStorage![prop];

                return obj[prop] || data;
            },

            deleteProperty(obj: LocalStorage, prop: keyof LocalStorage) {
                void chrome.storage.local.remove(<string>prop);

                return true;
            },
        };

        return {
            sync: new Proxy<T>({ handler: syncHandler } as unknown as T, syncHandler),
            local: new Proxy<U>({ handler: localHandler } as unknown as U, localHandler),
        };
    }

    forceSyncUpdate(prop: string): void {
        const value = this.cachedSyncConfig![prop];
        void chrome.storage.sync.set({ [prop]: value });
    }

    forceLocalUpdate(prop: string): void {
        const value = this.cachedLocalStorage![prop];

        void chrome.storage.local.set({ [prop]: value }, () => {
            if (chrome.runtime.lastError) {
                alert(chrome.i18n.getMessage("storageFull"));
            }
        });
    }

    async fetchConfig(): Promise<void> {
        await Promise.all([
            new Promise<void>((resolve) => {
                chrome.storage.sync.get(null, (items) => {
                    this.cachedSyncConfig = <T>(<unknown>items);

                    if (this.cachedSyncConfig === undefined) {
                        this.cachedSyncConfig = {} as T;

                        if (this.inDeArrow || window.location.href.includes("options.html")) {
                            alert(
                                `${chrome.i18n.getMessage("syncDisabledWarning")}${
                                    this.inDeArrow ? `\n\n${chrome.i18n.getMessage("syncDisabledWarningDeArrow")}` : ``
                                }${
                                    isFirefox() ? `\n\n${chrome.i18n.getMessage("syncDisabledFirefoxSuggestions")}` : ``
                                }`
                            );
                        }
                    }

                    resolve();
                });
            }),
            new Promise<void>((resolve) => {
                chrome.storage.local.get(null, (items) => {
                    this.cachedLocalStorage = <U>(<unknown>(items ?? {}));
                    resolve();
                });
            }),
        ]);
    }

    async setupConfig(migrateOldSyncFormats: (config: T) => void): Promise<StorageObjects<T, U>> {
        if (typeof chrome === "undefined") return null as unknown as StorageObjects<T, U>;

        await this.fetchConfig();
        this.addDefaults();
        const result = this.configProxy();
        migrateOldSyncFormats(result.sync);

        return result;
    }

    // Add defaults
    addDefaults() {
        for (const key in this.syncDefaults) {
            if (!Object.prototype.hasOwnProperty.call(this.cachedSyncConfig, key)) {
                this.cachedSyncConfig![key] = this.syncDefaults[key];
            } else if (key === "barTypes") {
                for (const key2 in this.syncDefaults[key]) {
                    if (!Object.prototype.hasOwnProperty.call(this.cachedSyncConfig![key], key2)) {
                        this.cachedSyncConfig![key][key2] = this.syncDefaults[key][key2];
                    }
                }
            }
        }

        for (const key in this.localDefaults) {
            if (!Object.prototype.hasOwnProperty.call(this.cachedLocalStorage, key)) {
                this.cachedLocalStorage![key] = this.localDefaults[key];
            }
        }
    }

    isReady(): boolean {
        return this.config !== null;
    }
}

export function keybindEquals(first: Keybind, second: Keybind): boolean {
    if (
        first == null ||
        second == null ||
        Boolean(first.alt) != Boolean(second.alt) ||
        Boolean(first.ctrl) != Boolean(second.ctrl) ||
        Boolean(first.shift) != Boolean(second.shift) ||
        (first.key == null && first.code == null) ||
        (second.key == null && second.code == null)
    )
        return false;
    if (first.code != null && second.code != null) return first.code === second.code;
    if (first.key != null && second.key != null) return first.key.toUpperCase() === second.key.toUpperCase();
    return false;
}

export function formatKey(key: string): string {
    if (key == null) return "";
    else if (key == " ") return "Space";
    else if (key.length == 1) return key.toUpperCase();
    else return key;
}

export function keybindToString(keybind: Keybind): string {
    if (keybind == null || keybind.key == null) return "";

    let ret = "";
    if (keybind.ctrl) ret += "Ctrl + ";
    if (keybind.alt) ret += "Alt + ";
    if (keybind.shift) ret += "Shift + ";

    return (ret += formatKey(keybind.key));
}
