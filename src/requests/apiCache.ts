import { DailyCacheStats } from "../types";
import { chromeP } from "../utils/browserApi";

type TimestampedValue<V> = {
    maxAge: number;
    value: V;
    size?: number;
};

type StoredData<K extends string, V> = {
    cache: Record<K, TimestampedValue<V>>;
    stats: DailyCacheStats;
};

/**
 * Small persistent TTL cache built on chrome.storage.local.
 * - Values are stored under a single storage key as a map from key -> { maxAge, value }
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
    private totalSizeBytes: number = 0;
    private operationQueue: Promise<void> = Promise.resolve();
    private persistTimer: number | null = null;
    private persistWaiters: Array<() => void> = [];
    private firstPersistTime: number | null = null;

    private cache: Record<K, TimestampedValue<V>> = {} as Record<K, TimestampedValue<V>>;
    private dailyStats: DailyCacheStats = {
        date: new Date().getDate().toString(),
        hits: 0,
        sizeBytes: 0,
    };

    private maxPersistWaitTime = 30000;
    private normalDelay = 5000;

    constructor(customKey: string, ttlMs: number, maxEntries = 2000, maxSizeBytes = 500 * 1024) {
        this.storageKey = "bsb_cache_" + customKey;
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
        this.maxSizeBytes = maxSizeBytes;
        this.ensureLoaded();
    }

    private async ensureLoaded(): Promise<void> {
        if (this.loaded) return;

        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        this.loadingPromise = (async () => {
            console.debug("loading", this.storageKey);
            const data = await new Promise<Record<string, unknown>>((resolve) => {
                chromeP.storage?.local?.get(this.storageKey, (items) => resolve(items || {}));
            });
            const stored = data?.[this.storageKey] as StoredData<K, V>;

            if (stored && stored.cache) {
                this.cache = (stored.cache || {}) as Record<K, TimestampedValue<V>>;
                if (stored.stats) {
                    this.dailyStats = stored.stats as DailyCacheStats;
                }
            } else if (stored) {
                // Old format, just cache data
                this.cache = (stored || {}) as Record<K, TimestampedValue<V>>;
            }

            // Recompute aggregate totalSizeBytes from cached per-entry sizeBytes only
            this.totalSizeBytes = 0;
            for (const key in this.cache) {
                const entry = this.cache[key];
                if (!entry) continue;
                this.totalSizeBytes += this.getEntrySize(entry);
            }

            this.loaded = true;
            this.loadingPromise = null;
            this.checkAndResetDailyStats();
        })();

        return this.loadingPromise;
    }

    private getEntrySize(entry: TimestampedValue<V>): number {
        if (entry.size != null) return entry.size;
        entry.size = this.calculateSize(entry.value);
        return entry.size;
    }

    private calculateSize(value: V): number {
        return JSON.stringify(value).length;
    }

    private checkAndResetDailyStats(): void {
        const today = new Date().getDate().toString();
        if (this.dailyStats.date !== today) {
            this.dailyStats = {
                date: today,
                hits: 0,
                sizeBytes: 0,
            };
        }
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

    private isExpired(entry: TimestampedValue<V>): boolean {
        return !entry.maxAge || Date.now() >= entry.maxAge;
    }

    private getEntriesByCreationTime(): [K, TimestampedValue<V>][] {
        return Object.entries(this.cache)
            .map(([key, value]) => [key as K, value as TimestampedValue<V>] as [K, TimestampedValue<V>])
            .sort(([, a], [, b]) => a.maxAge - b.maxAge);
    }

    private removeKey(key: K): void {
        const entry = this.cache[key];
        if (entry && entry.size != null) {
            this.totalSizeBytes -= entry.size;
        }
        delete this.cache[key];
    }

    async getRaw(key: K): Promise<TimestampedValue<V> | undefined> {
        await this.ensureLoaded();
        return this.cache[key];
    }

    async get(key: K, countAsHit = false): Promise<V | undefined> {
        await this.ensureLoaded();
        this.checkAndResetDailyStats();
        const entry = this.cache[key];
        if (!entry) return undefined;
        if (this.isExpired(entry)) {
            this.removeKey(key);
            return undefined;
        }

        if (countAsHit) {
            this.dailyStats.hits++;
            this.dailyStats.sizeBytes += this.getEntrySize(entry);
        }

        return entry.value;
    }

    async set(key: K, value: V): Promise<void> {
        return this.queueOperation(async () => {
            await this.ensureLoaded();
            const newSize = this.calculateSize(value);
            this.removeKey(key);
            this.cache[key] = { value, maxAge: Date.now() + this.ttlMs, size: newSize } as TimestampedValue<V>;
            this.totalSizeBytes += newSize;
            this.persist();
        });
    }

    async merge(key: K, mergeFn: (oldValue: V | undefined) => V): Promise<V> {
        return this.queueOperation(async () => {
            await this.ensureLoaded();
            const next = mergeFn(this.cache[key]?.value);
            const newSize = this.calculateSize(next);
            this.removeKey(key);
            this.cache[key] = { value: next, maxAge: Date.now() + this.ttlMs, size: newSize } as TimestampedValue<V>;
            this.totalSizeBytes += newSize;
            this.persist();
            return next;
        });
    }

    async delete(key: K): Promise<void> {
        return this.queueOperation(async () => {
            await this.ensureLoaded();
            this.removeKey(key);
            this.persist();
        });
    }

    async clear(): Promise<void> {
        return this.queueOperation(async () => {
            await this.ensureLoaded();
            this.cache = {} as Record<K, TimestampedValue<V>>;
            this.totalSizeBytes = 0;
            this.resetDailyStats();
            await new Promise<void>((resolve) => {
                chromeP.storage?.local?.remove(this.storageKey, () => resolve());
            });
        });
    }

    private resetDailyStats(): void {
        this.dailyStats = {
            date: new Date().getDate().toString(),
            hits: 0,
            sizeBytes: 0,
        };
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
                timeSinceFirst >= this.maxPersistWaitTime
                    ? 0
                    : Math.min(this.normalDelay, this.maxPersistWaitTime - timeSinceFirst);

            this.persistTimer = setTimeout(() => {
                console.debug("persist", this.storageKey, "at", new Date().toISOString());
                this.gcIfNeeded();
                const dataToStore: StoredData<K, V> = {
                    cache: this.cache,
                    stats: this.dailyStats,
                };
                chromeP.storage?.local?.set({ [this.storageKey]: dataToStore }, () => {
                    const waiters = this.persistWaiters.splice(0);
                    waiters.forEach((w) => w());
                });
                this.persistTimer = null;
                this.firstPersistTime = null;
            }, delay) as unknown as number;
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
            this.removeKey(key);
        }
    }

    private gcIfNeeded(): void {
        this.cleanupExpired();

        const keys = Object.keys(this.cache) as K[];
        const needsEviction = keys.length > this.maxEntries || this.totalSizeBytes > this.maxSizeBytes;

        if (!needsEviction) return;

        const entriesByAge = this.getEntriesByCreationTime();

        let entriesToRemove = Math.max(0, keys.length - this.maxEntries);

        for (const [key] of entriesByAge) {
            if (entriesToRemove > 0) {
                this.removeKey(key);
                entriesToRemove--;
            } else {
                if (this.totalSizeBytes <= this.maxSizeBytes) {
                    break;
                }
                this.removeKey(key);
            }
        }
    }

    getCacheStats(): {
        entryCount: number;
        sizeBytes: number;
        maxEntries: number;
        maxSizeBytes: number;
        dailyStats: {
            date: string;
            hits: number;
            sizeBytes: number;
        };
    } {
        if (!this.loaded) {
            return {
                entryCount: 0,
                sizeBytes: 0,
                maxEntries: this.maxEntries,
                maxSizeBytes: this.maxSizeBytes,
                dailyStats: this.dailyStats,
            };
        }
        const entryCount = Object.keys(this.cache).length;
        const sizeBytes = this.totalSizeBytes;

        this.checkAndResetDailyStats();
        this.persist();

        return {
            entryCount,
            sizeBytes,
            maxEntries: this.maxEntries,
            maxSizeBytes: this.maxSizeBytes,
            dailyStats: this.dailyStats,
        };
    }

    setMaxSizeBytes(maxSizeBytes: number): void {
        this.maxSizeBytes = maxSizeBytes;
    }

    getMaxSizeBytes(): number {
        return this.maxSizeBytes;
    }
}
