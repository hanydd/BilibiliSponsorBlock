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

    async getFresh(key: K): Promise<V | undefined> {
        await this.ensureLoaded();
        const entry = this.cache[key];
        if (!entry) return undefined;
        if (this.isExpired(entry)) return undefined;
        return entry.value;
    }

    async set(key: K, value: V): Promise<void> {
        await this.ensureLoaded();
        this.cache[key] = { value, timestamp: Date.now() } as TimestampedValue<V>;
        await this.gcIfNeeded();
        await this.persist();
    }

    async merge(key: K, mergeFn: (oldValue: V | undefined) => V): Promise<V> {
        await this.ensureLoaded();
        const old = this.cache[key]?.value;
        const next = mergeFn(old);
        this.cache[key] = { value: next, timestamp: Date.now() } as TimestampedValue<V>;
        await this.gcIfNeeded();
        await this.persist();
        return next;
    }

    async delete(key: K): Promise<void> {
        await this.ensureLoaded();
        delete this.cache[key];
        await this.persist();
    }

    async clear(): Promise<void> {
        await this.ensureLoaded();
        this.cache = {} as Record<K, TimestampedValue<V>>;
        await new Promise<void>((resolve) => {
            chromeP.storage?.local?.remove(this.storageKey, () => resolve());
        });
    }

    private async gcIfNeeded(): Promise<void> {
        const keys = Object.keys(this.cache) as K[];
        if (keys.length <= this.maxEntries) return;
        // remove oldest entries until within limit
        keys.map((k) => [k, this.cache[k].timestamp] as const)
            .sort((a, b) => a[1] - b[1])
            .slice(0, Math.max(0, keys.length - this.maxEntries))
            .forEach(([k]) => delete this.cache[k]);
    }
}
