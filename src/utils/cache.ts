interface CacheRecord<V> {
    value: V;
    lastUsed: number;
}

export class DataCache<T extends string, V> {
    private cache: Record<string, CacheRecord<V>>;
    private init: () => V;
    private cacheLimit: number;
    private storageKey: string;
    private persistEnabled: boolean;

    constructor(storageKey?: string, init?: () => V, cacheLimit = 2000) {
        this.cache = {};
        this.init = init;
        this.cacheLimit = cacheLimit;
        this.storageKey = storageKey || "bsb_cache_default";
        this.persistEnabled = !!storageKey;
    }

    public getFromCache(key: T): V | undefined {
        this.cacheUsed(key);
        return this.cache[key]?.value;
    }

    public set(key: T, value: V): void {
        this.cache[key] = { value: value, lastUsed: Date.now() };
        this.gc();
    }

    public computeIfNotExists(key: T, generate = this.init): V {
        if (!this.cache[key]) {
            this.set(key, generate());
        }
        return this.getFromCache(key);
    }

    public delete(key: T): void {
        delete this.cache[key];
    }

    public cacheUsed(key: T): boolean {
        if (this.cache[key]) {
            this.cache[key].lastUsed = Date.now();
        }

        return !!this.cache[key];
    }

    public contains(key: T): boolean {
        return !!this.cache[key];
    }

    private gc(): void {
        if (Object.keys(this.cache).length > this.cacheLimit) {
            const oldest = Object.entries(this.cache).reduce((a, b) => (a[1].lastUsed < b[1].lastUsed ? a : b));
            delete this.cache[oldest[0]];
        }
    }

    // Clear the entire cache
    public clear(): void {
        this.cache = {};
        if (this.persistEnabled) {
            localStorage.removeItem(this.storageKey);
        }
    }
}
