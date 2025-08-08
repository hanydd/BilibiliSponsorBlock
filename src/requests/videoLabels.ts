import { Category, NewVideoID } from "../types";

/**
 * Content-side thin wrapper: forward to background to leverage persistent caching.
 */
export async function getVideoLabel(videoID: NewVideoID, refreshCache = false): Promise<Category | null> {
    return await new Promise<Category | null>((resolve) => {
        chrome.runtime.sendMessage(
            { message: "getVideoLabel", videoID, refreshCache },
            (response: { category?: Category | null }) => resolve(response?.category ?? null)
        );
    });
}

/**
 * Optional: force clear cache for a specific videoID or all.
 * - When videoID is provided, only its prefix bucket is updated and that video's entry removed
 * - When omitted, clears the entire cache
 */
export async function clearVideoLabelCache(videoID?: string): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
        chrome.runtime.sendMessage({ message: "clearVideoLabelCache", videoID }, (response: { ok: boolean }) =>
            resolve(Boolean(response?.ok))
        );
    });
}
