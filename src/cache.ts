interface CacheRecord {
    lastUsed: number;
}

export class DataCache<T extends string, V> {
    private cache: Record<string, V & CacheRecord>;
    private init: () => V;
    private cacheLimit: number;

    constructor(init: () => V, cacheLimit = 2000) {
        this.cache = {};
        this.init = init;
        this.cacheLimit = cacheLimit;
    }

    public getFromCache(key: T): V & CacheRecord | undefined {
        return this.cache[key];
    }

    public setupCache(key: T): V & CacheRecord {
        if (!this.cache[key]) {
            this.cache[key] = {
                ...this.init(),
                lastUsed: Date.now()
            };

            if (Object.keys(this.cache).length > this.cacheLimit) {
                const oldest = Object.entries(this.cache).reduce((a, b) => a[1].lastUsed < b[1].lastUsed ? a : b);
                delete this.cache[oldest[0]];
            }
        }

        return this.cache[key];
    }

    public cacheUsed(key: T): boolean {
        if (this.cache[key]) this.cache[key].lastUsed = Date.now();

        return !!this.cache[key];
    }
}