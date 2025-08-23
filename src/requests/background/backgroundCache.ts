import { BVID } from "../../types";
import { PersistentTTLCache } from "../apiCache";
import { FetchResponse, LabelBlock, SegmentResponse } from "../type/requestType";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Legacy Video Segment Cache
 */
const SEGMENTS_CACHE_KEY = "bsb_cache_segments";
export const legacySegmentsCache = new PersistentTTLCache<BVID, SegmentResponse>(SEGMENTS_CACHE_KEY, HOUR_MS, 0);
legacySegmentsCache.clear();

/**
 * Video Segment Cache
 */
const SEGMENTS_RESPONSE_CACHE_KEY = "bsb_cache_segment_response";
export const segmentsCache = new PersistentTTLCache<string, FetchResponse>(SEGMENTS_RESPONSE_CACHE_KEY, HOUR_MS, 100);

/**
 * Video Label Cache
 */
const VIDEO_LABEL_CACHE_KEY = "bsb_cache_video_labels";
export const videoLabelCache = new PersistentTTLCache<string, LabelBlock>(VIDEO_LABEL_CACHE_KEY, HOUR_MS, 100);
