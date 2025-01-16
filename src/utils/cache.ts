interface CacheRecord {
    lastUsed: number;
}

export class DataCache<T extends string, V> {
    private cache: Record<string, V & CacheRecord>;
    private init: () => V;
    private cacheLimit: number;

    constructor(init?: () => V, cacheLimit = 2000) {
        this.cache = {};
        this.init = init;
        this.cacheLimit = cacheLimit;
    }

    public getFromCache(key: T): (V & CacheRecord) | undefined {
        this.cacheUsed(key);
        return this.cache[key];
    }

    public set(key: T, value: V): void {
        this.cache[key] = {
            ...value,
            lastUsed: Date.now(),
        };
        this.gc();
    }

    public delete(key: T): void {
        delete this.cache[key];
    }

    public setupCache(key: T): V & CacheRecord {
        if (!this.cache[key] && this.init) {
            this.set(key, this.init());
        }

        return this.cache[key];
    }

    public cacheUsed(key: T): boolean {
        if (this.cache[key]) this.cache[key].lastUsed = Date.now();

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
}
