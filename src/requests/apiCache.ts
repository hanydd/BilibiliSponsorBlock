import { chromeP } from "../utils/browserApi";

type TimestampedValue<V> = {
    timestamp: number;
    value: V;
};

/**
 * Small persistent TTL cache built on chrome.storage.local.
 * - Values are stored under a single storage key as a map from key -> { timestamp, value }
 * - getFresh returns undefined if not present or expired
 * - Designed for background-only usage
 */
export class PersistentTTLCache<K extends string, V> {
    private storageKey: string;
    private ttlMs: number;
    private maxEntries: number;
    private loaded = false;
    private cache: Record<K, TimestampedValue<V>> = {} as Record<K, TimestampedValue<V>>;
    private operationQueue: Promise<void> = Promise.resolve();

    constructor(storageKey: string, ttlMs: number, maxEntries = 2000) {
        this.storageKey = storageKey;
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
    }

    private async ensureLoaded(): Promise<void> {
        if (this.loaded) return;
        const data = await new Promise<Record<string, unknown>>((resolve) => {
            chromeP.storage?.local?.get(this.storageKey, (items) => resolve(items || {}));
        });
        const stored = data?.[this.storageKey] as Record<K, TimestampedValue<V>> | undefined;
        this.cache = (stored || {}) as Record<K, TimestampedValue<V>>;
        this.loaded = true;
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
        await new Promise<void>((resolve) => {
            chromeP.storage?.local?.set({ [this.storageKey]: this.cache }, () => resolve());
        });
    }

    private isExpired(entry: TimestampedValue<V>): boolean {
        return Date.now() - entry.timestamp >= this.ttlMs;
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
            await this.persist();
        });
    }

    async merge(key: K, mergeFn: (oldValue: V | undefined) => V): Promise<V> {
        return this.queueOperation(async () => {
            await this.ensureLoaded();
            const old = this.cache[key]?.value;
            const next = mergeFn(old);
            this.cache[key] = { value: next, timestamp: Date.now() } as TimestampedValue<V>;
            await this.gcIfNeeded();
            await this.persist();
            return next;
        });
    }

    async delete(key: K): Promise<void> {
        return this.queueOperation(async () => {
            await this.ensureLoaded();
            this.cleanupExpired();
            delete this.cache[key];
            await this.persist();
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
        if (keys.length <= this.maxEntries) return;

        keys.map((k) => [k, this.cache[k].timestamp] as const)
            .sort((a, b) => a[1] - b[1])
            .slice(0, Math.max(0, keys.length - this.maxEntries))
            .forEach(([k]) => delete this.cache[k]);
    }
}
