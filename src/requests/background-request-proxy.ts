import { objectToURI } from "../utils/";
import { getHash, getVideoIDHash } from "../utils/hash";
import { PersistentTTLCache } from "./apiCache";
import { parseBvidAndCidFromVideoId } from "../utils/videoIdUtils";
import {
    BVID,
    Category,
    CategorySkipOption,
    NewVideoID,
    SponsorTime,
    SponsorSourceType,
    ActionType,
    SponsorTimeHashedID,
} from "../types";
import Config from "../config";
import * as CompileConfig from "../../config.json";

export interface FetchResponse {
    responseText: string;
    status: number;
    ok: boolean;
}

export interface SegmentResponse {
    segments: SponsorTime[] | null;
    status: number;
}

/**
 * Sends a request to the specified url
 *
 * @param type The request type "GET", "POST", etc.
 * @param address The address to add to the SponsorBlock server address
 * @param callback
 */
export async function sendRealRequestToCustomServer(
    type: string,
    url: string,
    data: Record<string, unknown> | null = {},
    headers: Record<string, string> = {}
) {
    // If GET, convert JSON to parameters
    if (type.toLowerCase() === "get") {
        url = objectToURI(url, data, true);

        data = null;
    }

    const response = await fetch(url, {
        method: type,
        headers: {
            "Content-Type": "application/json",
            "X-EXT-VERSION": chrome.runtime.getManifest().version,
            ...headers,
        },
        redirect: "follow",
        body: data ? JSON.stringify(data) : null,
    });

    return response;
}

export function setupBackgroundRequestProxy() {
    chrome.runtime.onMessage.addListener((request, sender, callback) => {
        if (request.message === "sendRequest") {
            sendRealRequestToCustomServer(request.type, request.url, request.data, request.headers)
                .then(async (response) => {
                    callback({ responseText: await response.text(), status: response.status, ok: response.ok });
                })
                .catch(() => {
                    callback({ responseText: "", status: -1, ok: false });
                });

            return true;
        }

        if (request.message === "getHash") {
            getHash(request.value, request.times)
                .then(callback)
                .catch((e) => {
                    callback({ error: e?.message });
                });

            return true;
        }

        // ============ Video Labels Cached API (background only) ============
        if (request.message === "getVideoLabel") {
            getVideoLabelBackground(request.videoID as NewVideoID, Boolean(request.refreshCache))
                .then((category) => callback({ category }))
                .catch(() => callback({ category: null }));

            return true;
        }

        if (request.message === "clearVideoLabelCache") {
            clearVideoLabelCacheBackground(request.videoID as BVID | undefined)
                .then(() => callback({ ok: true }))
                .catch(() => callback({ ok: false }));

            return true;
        }

        // ============ Segments Cached API (background only) ============
        if (request.message === "getSegments") {
            getSegmentsBackground(
                request.videoID as NewVideoID,
                (request.extraRequestData as Record<string, unknown>) || {},
                Boolean(request.ignoreCache)
            )
                .then((response) => callback({ response }))
                .catch(() => callback({ response: { segments: null, status: -1 } }));

            return true;
        }

        if (request.message === "clearSegmentsCache") {
            clearSegmentsCacheBackground(request.videoID as BVID | undefined)
                .then(() => callback({ ok: true }))
                .catch(() => callback({ ok: false }));

            return true;
        }

        return false;
    });
}

export function sendRequestToCustomServer(type: string, url: string, data = {}, headers = {}): Promise<FetchResponse> {
    return new Promise((resolve, reject) => {
        // Ask the background script to do the work
        chrome.runtime.sendMessage({ message: "sendRequest", type, url, data, headers }, (response) => {
            if (response.status !== -1) {
                resolve(response);
            } else {
                reject(response);
            }
        });
    });
}

// ===================== Common Helper Functions =====================

function getServerAddress(): string {
    return Config.config.testingServer ? CompileConfig.testingServerAddress : Config.config.serverAddress;
}

async function callAPI(
    type: string,
    endpoint: string,
    extraRequestData: Record<string, unknown> = {},
    skipServerCache: boolean = false
): Promise<FetchResponse> {
    const url = `${getServerAddress()}${endpoint}`;

    const response = await sendRealRequestToCustomServer(
        type,
        url,
        extraRequestData,
        skipServerCache ? { "X-SKIP-CACHE": "1" } : {}
    );

    return {
        responseText: await response.text(),
        status: response.status,
        ok: response.ok,
    };
}

// ===================== Internal: Video Label Cache Service =====================

type LabelBlock = Record<BVID, Category>;

const VIDEO_LABEL_CACHE_KEY = "bsb_cache_video_labels";
const ONE_HOUR_MS = 60 * 60 * 1000;
const videoLabelCache = new PersistentTTLCache<string, LabelBlock>(VIDEO_LABEL_CACHE_KEY, ONE_HOUR_MS, 4096);

// ===================== Internal: Segments Cache Service =====================

const SEGMENTS_CACHE_KEY = "bsb_cache_segments";
const segmentsCache = new PersistentTTLCache<BVID, SegmentResponse>(SEGMENTS_CACHE_KEY, ONE_HOUR_MS, 4096);

function isCategoryEnabled(category: Category): boolean {
    const selections = Config?.config?.categorySelections ?? [];
    const selection = selections.find((s) => s.name === category);
    const option = selection?.option ?? CategorySkipOption.Disabled;
    return option !== CategorySkipOption.Disabled;
}

async function fetchLabelBlock(prefix: string, skipServerCache: boolean): Promise<LabelBlock> {
    const response = await callAPI("GET", `/api/videoLabels/${prefix}`, {}, skipServerCache);

    if (!response.ok || response.status !== 200) return {} as LabelBlock;

    const data = JSON.parse(response.responseText) as Array<{ videoID: BVID; segments: Array<{ category: Category }> }>;
    const block: LabelBlock = Object.fromEntries(
        (data || []).map((video) => [video.videoID, video.segments?.[0]?.category]).filter(([, c]) => !!c)
    ) as LabelBlock;
    return block;
}

async function getOrFetchLabelBlock(prefix: string, refreshCache: boolean): Promise<LabelBlock> {
    const cached = await videoLabelCache.getFresh(prefix);
    if (cached && !refreshCache) return cached;

    const block = await fetchLabelBlock(prefix, refreshCache);
    await videoLabelCache.set(prefix, block);
    return block;
}

async function getVideoLabelBackground(videoID: NewVideoID, refreshCache: boolean): Promise<Category | null> {
    const { bvId } = parseBvidAndCidFromVideoId(videoID);
    if (!bvId) return null;

    const prefix = (await getVideoIDHash(bvId)).slice(0, 4);
    const block = await getOrFetchLabelBlock(prefix, refreshCache);
    const category = block?.[bvId];
    if (!category) return null;

    return isCategoryEnabled(category) ? category : null;
}

async function clearVideoLabelCacheBackground(videoID?: BVID): Promise<void> {
    if (!videoID) {
        await videoLabelCache.clear();
        return;
    }
    const prefix = (await getVideoIDHash(videoID)).slice(0, 4);
    const existing = await videoLabelCache.getRaw(prefix);
    if (!existing?.value) return;
    const next = { ...existing.value } as LabelBlock;
    delete next[videoID];
    await videoLabelCache.set(prefix, next);
}

// ===================== Internal: Segments Cache Service Functions =====================

function getEnabledActionTypes(forceFullVideo = false): ActionType[] {
    const actionTypes = [ActionType.Skip, ActionType.Poi];
    if (Config.config.muteSegments) {
        actionTypes.push(ActionType.Mute);
    }
    if (Config.config.fullVideoSegments || forceFullVideo) {
        actionTypes.push(ActionType.Full);
    }
    return actionTypes;
}

async function fetchSegmentsByHash(
    hashPrefix: string,
    extraRequestData: Record<string, unknown>,
    ignoreCache: boolean
): Promise<FetchResponse> {
    return await callAPI("GET", `/api/skipSegments/${hashPrefix}`, extraRequestData, ignoreCache);
}

async function getSegmentsBackground(
    videoID: NewVideoID,
    extraRequestData: Record<string, unknown> = {},
    ignoreCache: boolean = false
): Promise<SegmentResponse> {
    const { bvId } = parseBvidAndCidFromVideoId(videoID);
    if (!bvId) {
        return { segments: null, status: 404 };
    }

    if (ignoreCache) {
        await segmentsCache.delete(bvId);
    }

    const cachedData = await segmentsCache.getFresh(bvId);
    if (cachedData) {
        return cachedData;
    }

    const categories: string[] = Config.config.categorySelections.map((category) => category.name);
    const hashPrefix = (await getVideoIDHash(bvId)).slice(0, 4);
    const response = await fetchSegmentsByHash(hashPrefix, extraRequestData, ignoreCache);

    const responseSegments: SegmentResponse = { segments: null, status: response.status };
    if (!response?.ok) {
        await segmentsCache.set(bvId, responseSegments);
        return responseSegments;
    }

    const allSegments: SponsorTimeHashedID[] = JSON.parse(response?.responseText);

    for (const segmentResponse of allSegments) {
        const segment = segmentResponse.segments
            ?.filter(
                (segment: SponsorTime) =>
                    getEnabledActionTypes().includes(segment.actionType) && categories.includes(segment.category)
            )
            ?.map((segment: SponsorTime) => ({
                ...segment,
                source: SponsorSourceType.Server,
            }))
            ?.sort((a: SponsorTime, b: SponsorTime) => a.segment[0] - b.segment[0]);

        await segmentsCache.set(segmentResponse.videoID, { segments: segment, status: response.status });
        if (bvId == segmentResponse.videoID) {
            responseSegments.segments = segment;
        }
    }

    await segmentsCache.set(bvId, responseSegments);
    return responseSegments;
}

async function clearSegmentsCacheBackground(videoID?: BVID): Promise<void> {
    if (!videoID) {
        await segmentsCache.clear();
        return;
    }
    await segmentsCache.delete(videoID);
}
