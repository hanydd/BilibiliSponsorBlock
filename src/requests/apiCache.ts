import { chromeP } from "../utils/browserApi";

type TimestampedValue<V> = {
    timestamp: number;
    value: V;
};

/**
 * Small persistent TTL cache built on chrome.storage.local.
 * - Values are stored under a single storage key as a map from key -> { timestamp, value }
 * - getFresh returns undefined if not present or expired
 * - Supports both entry count and size-based eviction
 * - Designed for background-only usage
 */
export class PersistentTTLCache<K extends string, V> {
    private storageKey: string;
    private ttlMs: number;
    private maxEntries: number;
    private maxSizeBytes: number;
    private loaded = false;
    private loadingPromise: Promise<void> | null = null;
    private cache: Record<K, TimestampedValue<V>> = {} as Record<K, TimestampedValue<V>>;
    private operationQueue: Promise<void> = Promise.resolve();
    private persistTimer: number | null = null;
    private persistWaiters: Array<() => void> = [];
    private firstPersistTime: number | null = null;

    private maxWaitTime = 5000;
    private normalDelay = 1000;

    constructor(storageKey: string, ttlMs: number, maxEntries = 2000, maxSizeBytes = 500 * 1024) {
        this.storageKey = storageKey;
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
        this.maxSizeBytes = maxSizeBytes;
    }

    private async ensureLoaded(): Promise<void> {
        if (this.loaded) return;

        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        this.loadingPromise = (async () => {
            const data = await new Promise<Record<string, unknown>>((resolve) => {
                chromeP.storage?.local?.get(this.storageKey, (items) => resolve(items || {}));
            });
            const stored = data?.[this.storageKey] as Record<K, TimestampedValue<V>> | undefined;
            this.cache = (stored || {}) as Record<K, TimestampedValue<V>>;
            this.loaded = true;
            this.loadingPromise = null;
        })();

        return this.loadingPromise;
    }

    private queueOperation<T>(operation: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.operationQueue = this.operationQueue
                .then(async () => {
                    try {
                        const result = await operation();
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    private async persist(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.persistWaiters.push(resolve);

            const now = Date.now();
            if (this.firstPersistTime === null) {
                this.firstPersistTime = now;
            }
            if (this.persistTimer != null) {
                clearTimeout(this.persistTimer);
            }

            const timeSinceFirst = now - this.firstPersistTime;
            const delay =
                timeSinceFirst >= this.maxWaitTime ? 0 : Math.min(this.normalDelay, this.maxWaitTime - timeSinceFirst);

            this.persistTimer = setTimeout(() => {
                console.debug("persist", this.storageKey, "at", new Date().toISOString());
                this.persistTimer = null;
                this.firstPersistTime = null;
                chromeP.storage?.local?.set({ [this.storageKey]: this.cache }, () => {
                    const waiters = this.persistWaiters.splice(0);
                    waiters.forEach((w) => w());
                });
            }, delay) as unknown as number;
        });
    }

    private isExpired(entry: TimestampedValue<V>): boolean {
        return Date.now() - entry.timestamp >= this.ttlMs;
    }

    private getCurrentCacheSize(): number {
        try {
            return new Blob([JSON.stringify(this.cache)]).size;
        } catch {
            return JSON.stringify(this.cache || "").length * 2;
        }
    }

    private getEntriesByCreationTime(): [K, TimestampedValue<V>][] {
        return Object.entries(this.cache)
            .map(([key, value]) => [key as K, value as TimestampedValue<V>] as [K, TimestampedValue<V>])
            .sort(([, a], [, b]) => a.timestamp - b.timestamp);
    }

    async getRaw(key: K): Promise<TimestampedValue<V> | undefined> {
        await this.ensureLoaded();
        return this.cache[key];
    }

    async get(key: K): Promise<V | undefined> {
        await this.ensureLoaded();
        const entry = this.cache[key];
        if (!entry) return undefined;
        if (this.isExpired(entry)) return undefined;
        return entry.value;
    }

    async set(key: K, value: V): Promise<void> {
        return this.queueOperation(async () => {
            await this.ensureLoaded();
            this.cleanupExpired();
            this.cache[key] = { value, timestamp: Date.now() } as TimestampedValue<V>;
            await this.gcIfNeeded();
            this.persist();
        });
    }

    async merge(key: K, mergeFn: (oldValue: V | undefined) => V): Promise<V> {
        return this.queueOperation(async () => {
            await this.ensureLoaded();
            const old = this.cache[key]?.value;
            const next = mergeFn(old);
            this.cache[key] = { value: next, timestamp: Date.now() } as TimestampedValue<V>;
            await this.gcIfNeeded();
            this.persist();
            return next;
        });
    }

    async delete(key: K): Promise<void> {
        return this.queueOperation(async () => {
            await this.ensureLoaded();
            this.cleanupExpired();
            delete this.cache[key];
            this.persist();
        });
    }

    async clear(): Promise<void> {
        return this.queueOperation(async () => {
            await this.ensureLoaded();
            this.cache = {} as Record<K, TimestampedValue<V>>;
            await new Promise<void>((resolve) => {
                chromeP.storage?.local?.remove(this.storageKey, () => resolve());
            });
        });
    }

    private cleanupExpired(): void {
        const keysToDelete: K[] = [];

        for (const key in this.cache) {
            const entry = this.cache[key];
            if (!entry || this.isExpired(entry)) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            delete this.cache[key];
        }
    }

    private async gcIfNeeded(): Promise<void> {
        const keys = Object.keys(this.cache) as K[];
        let needsEviction = keys.length > this.maxEntries;

        if (!needsEviction) {
            const currentSize = this.getCurrentCacheSize();
            needsEviction = currentSize > this.maxSizeBytes;
        }

        if (!needsEviction) return;

        const entriesByAge = this.getEntriesByCreationTime();

        let entriesToRemove = Math.max(0, keys.length - this.maxEntries);

        for (const [key] of entriesByAge) {
            if (entriesToRemove > 0) {
                delete this.cache[key];
                entriesToRemove--;
            } else {
                const currentSize = this.getCurrentCacheSize();
                if (currentSize <= this.maxSizeBytes) {
                    break;
                }
                delete this.cache[key];
            }
        }
    }

    async getCacheStats(): Promise<{
        entryCount: number;
        sizeBytes: number;
        maxEntries: number;
        maxSizeBytes: number;
        sizeLimitReached: boolean;
        entryLimitReached: boolean;
    }> {
        await this.ensureLoaded();
        const entryCount = Object.keys(this.cache).length;
        const sizeBytes = this.getCurrentCacheSize();

        return {
            entryCount,
            sizeBytes,
            maxEntries: this.maxEntries,
            maxSizeBytes: this.maxSizeBytes,
            sizeLimitReached: sizeBytes > this.maxSizeBytes,
            entryLimitReached: entryCount > this.maxEntries,
        };
    }

    setMaxSizeBytes(maxSizeBytes: number): void {
        this.maxSizeBytes = maxSizeBytes;
    }

    getMaxSizeBytes(): number {
        return this.maxSizeBytes;
    }
}
