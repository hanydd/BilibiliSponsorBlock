import { BilibiliPagelistDetail } from "../requests/type/BilibiliRequestType";
import { BVID, CID } from "../types";
import { DataCache } from "../utils/cache";

const cache = new DataCache<BVID, Record<number, CID>>("cid_map", () => ({}));

export function saveCidMap(bvid: BVID, pageList: BilibiliPagelistDetail[]): void {
    if (!bvid || !pageList || !Array.isArray(pageList)) {
        console.error("[BSB] Invalid data for saveCidMap", { bvid, pageList });
        return;
    }

    try {
        const map = cache.computeIfNotExists(bvid, () => ({}));
        for (const page of pageList) {
            if (page && page.page !== undefined && page.cid) {
                map[page.page] = page.cid;
            }
        }
    } catch (error) {
        console.error("[BSB] Error saving CID map:", error);
    }
}

export async function getCidFromBvIdPage(bvid: BVID, page?: number): Promise<CID | null> {
    if (!bvid) {
        console.error("[BSB] Invalid BVID provided to getCidFromBvIdPage");
        return null;
    }
    // Try to get CID from window state if available
    if (window?.__INITIAL_STATE__?.videoData?.pages && window?.__INITIAL_STATE__?.bvid === bvid) {
        saveCidMap(bvid, window.__INITIAL_STATE__.videoData.pages);
    }
    if (!page) {
        page = 1;
    }
    const result = cache.getFromCache(bvid)?.[page];
    return result || null;
}
