interface CacheRecord {
    lastUsed: number;
}

export class DataCache<T extends string, V> {
    private cache: Record<string, V & CacheRecord>;
    private init: () => V;
    private cacheLimit: number;
    private storageKey: string;
    private persistEnabled: boolean;

    constructor(storageKey?: string, init?: () => V, cacheLimit = 2000) {
        this.cache = {};
        this.init = init;
        this.cacheLimit = cacheLimit;
        this.storageKey = storageKey || 'bsb_cache_default';
        this.persistEnabled = !!storageKey;

        // Load from localStorage if persistence is enabled
        if (this.persistEnabled) {
            this.loadFromStorage();
        }
    }

    private loadFromStorage(): void {
        try {
            const storedData = localStorage.getItem(this.storageKey);
            if (storedData) {
                this.cache = JSON.parse(storedData);
            }
        } catch (e) {
            console.error(`[BSB] Failed to load cache from localStorage: ${e}`);
        }
    }

    private saveToStorage(): void {
        if (!this.persistEnabled) return;
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.cache));
        } catch (e) {
            console.error(`[BSB] Failed to save cache to localStorage: ${e}`);
        }
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
        this.saveToStorage();
    }

    public computeIfNotExists(key: T, generate = this.init): V {
        if (!this.cache[key]) {
            this.set(key, generate());
        }
        return this.cache[key];
    }

    public delete(key: T): void {
        delete this.cache[key];
        this.saveToStorage();
    }

    public setupCache(key: T): V & CacheRecord {
        if (!this.cache[key] && this.init) {
            this.set(key, this.init());
        }

        return this.cache[key];
    }

    public cacheUsed(key: T): boolean {
        if (this.cache[key]) {
            this.cache[key].lastUsed = Date.now();
            this.saveToStorage();
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
            this.saveToStorage();
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
