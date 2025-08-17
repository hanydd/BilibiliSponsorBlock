import { NewVideoID } from "../types";
import { SegmentResponse } from "./type/requestType";

/**
 * Content-side thin wrapper: forward to background to leverage persistent caching.
 */
export async function getSegmentsByVideoID(
    videoID: NewVideoID,
    extraRequestData: Record<string, unknown> = {},
    ignoreCache: boolean = false
): Promise<SegmentResponse> {
    return await new Promise<SegmentResponse>((resolve) => {
        chrome.runtime.sendMessage(
            { message: "getSegments", videoID, extraRequestData, ignoreCache },
            (response: { response?: SegmentResponse }) => resolve(response?.response ?? { segments: null, status: -1 })
        );
    });
}

/**
 * Optional: force clear cache for a specific videoID or all.
 * - When videoID is provided, only that video's entry is removed
 * - When omitted, clears the entire cache
 */
export async function clearSegmentsCache(videoID?: string): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
        chrome.runtime.sendMessage({ message: "clearSegmentsCache", videoID }, (response: { ok: boolean }) =>
            resolve(Boolean(response?.ok))
        );
    });
}
