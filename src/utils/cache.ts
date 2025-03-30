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

    private loadFromStorage(): void {
        try {
            const storedData = localStorage.getItem(this.storageKey);
            console.log(`[BSB] Loaded cache from localStorage: ${storedData}`);
            if (storedData) {
                const loadedCache = JSON.parse(storedData);
                if (loadedCache satisfies Record<string, CacheRecord<V>>) {
                    this.cache = loadedCache;
                } else {
                    throw new Error("Invalid cache format in localStorage");
                }
            }
        } catch (e) {
            console.error(`[BSB] Failed to load cache from localStorage: ${e}`);
        }
    }

    // Debounced save to reduce excessive localStorage writes
    private saveTimeout: number | null = null;
    private saveToStorage(): void {
        return;
        if (!this.persistEnabled) return;

        // Clear any existing timeout
        if (this.saveTimeout !== null) {
            window.clearTimeout(this.saveTimeout);
        }

        // Set a new timeout to save after a brief delay
        this.saveTimeout = window.setTimeout(() => {
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(this.cache));
                this.saveTimeout = null;
            } catch (e) {
                console.error(`[BSB] Failed to save cache to localStorage: ${e}`);
            }
        }, 200); // 200ms debounce
    }

    public getFromCache(key: T): V | undefined {
        this.cacheUsed(key);
        return this.cache[key]?.value;
    }

    public set(key: T, value: V): void {
        this.cache[key] = { value: value, lastUsed: Date.now() };
        this.gc();
        this.saveToStorage();
    }

    public computeIfNotExists(key: T, generate = this.init): V {
        if (!this.cache[key]) {
            this.set(key, generate());
        }
        return this.getFromCache(key);
    }

    public delete(key: T): void {
        delete this.cache[key];
        this.saveToStorage();
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
