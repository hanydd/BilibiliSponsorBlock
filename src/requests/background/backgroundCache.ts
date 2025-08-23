import { BVID } from "../../types";
import { PersistentTTLCache } from "../apiCache";
import { LabelBlock, SegmentResponse } from "../type/requestType";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Video Segment Cache
 */
const SEGMENTS_CACHE_KEY = "bsb_cache_segments";
export const segmentsCache = new PersistentTTLCache<BVID, SegmentResponse>(SEGMENTS_CACHE_KEY, HOUR_MS, 100);

/**
 * Video Label Cache
 */
const VIDEO_LABEL_CACHE_KEY = "bsb_cache_video_labels";
export const videoLabelCache = new PersistentTTLCache<string, LabelBlock>(VIDEO_LABEL_CACHE_KEY, HOUR_MS, 100);
