import Config from "../../config";
import { chromeP } from "../../utils/browserApi";
import { PersistentTTLCache } from "../apiCache";
import { FetchResponse, LabelBlock } from "../type/requestType";

const HOUR_MS = 60 * 60 * 1000;

class ConfigAwareCacheWrapper<K extends string, V> {
    private cache: PersistentTTLCache<K, V>;

    constructor(cacheInstance: PersistentTTLCache<K, V>) {
        this.cache = cacheInstance;
    }
    async get(key: K, countAsHit = false): Promise<V | undefined> {
        if (!Config.config.enableCache) return undefined;
        return this.cache.get(key, countAsHit);
    }
    async set(key: K, value: V): Promise<void> {
        if (!Config.config.enableCache) return;
        return this.cache.set(key, value);
    }
    async merge(key: K, mergeFn: (oldValue: V | undefined) => V): Promise<V> {
        if (!Config.config.enableCache) return undefined;
        return this.cache.merge(key, mergeFn);
    }
    async delete(key: K): Promise<void> {
        return this.cache.delete(key);
    }
    async clear(): Promise<void> {
        return this.cache.clear();
    }
    getCacheStats(): {
        entryCount: number;
        sizeBytes: number;
        maxEntries: number;
        maxSizeBytes: number;
    } {
        return this.cache.getCacheStats();
    }
}

/**
 * Clear Legacy Video Segment Cache
 */
chromeP.storage?.local?.remove("bsb_cache_segments");

/**
 * Video Segment Cache
 */
const SEGMENTS_RESPONSE_CACHE_KEY = "segment_response";
export const rawSegmentsCache = new PersistentTTLCache<string, FetchResponse>(
    SEGMENTS_RESPONSE_CACHE_KEY,
    HOUR_MS,
    1000,
    500 * 1024
);
export const segmentsCache = new ConfigAwareCacheWrapper(rawSegmentsCache);

/**
 * Video Label Cache
 */
const VIDEO_LABEL_CACHE_KEY = "video_labels";
export const rawVideoLabelCache = new PersistentTTLCache<string, LabelBlock>(
    VIDEO_LABEL_CACHE_KEY,
    HOUR_MS,
    5000,
    500 * 1024
);
export const videoLabelCache = new ConfigAwareCacheWrapper(rawVideoLabelCache);

/**
 * Clear all caches (segments and video labels)
 */
export async function clearAllCacheBackground(): Promise<void> {
    await Promise.all([segmentsCache.clear(), videoLabelCache.clear()]);
}
