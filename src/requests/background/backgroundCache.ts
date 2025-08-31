import { BVID } from "../../types";
import { PersistentTTLCache } from "../apiCache";
import { FetchResponse, LabelBlock, SegmentResponse } from "../type/requestType";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Legacy Video Segment Cache
 */
const SEGMENTS_CACHE_KEY = "segments";
export const legacySegmentsCache = new PersistentTTLCache<BVID, SegmentResponse>(SEGMENTS_CACHE_KEY, HOUR_MS, 0, 1024);
legacySegmentsCache.clear();

/**
 * Video Segment Cache
 */
const SEGMENTS_RESPONSE_CACHE_KEY = "segment_response";
export const segmentsCache = new PersistentTTLCache<string, FetchResponse>(
    SEGMENTS_RESPONSE_CACHE_KEY,
    HOUR_MS,
    1000,
    500 * 1024
);

/**
 * Video Label Cache
 */
const VIDEO_LABEL_CACHE_KEY = "video_labels";
export const videoLabelCache = new PersistentTTLCache<string, LabelBlock>(
    VIDEO_LABEL_CACHE_KEY,
    HOUR_MS,
    1000,
    500 * 1024
);
