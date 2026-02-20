import { BilibiliPagelistDetail, BilibiliPagelistDetailForEvent } from "../requests/type/BilibiliRequestType";
import { BVID, CID } from "../types";
import { DataCache } from "../utils/cache";

const cache = new DataCache<BVID, Map<number, CID>>("cid_map", () => new Map());

export function saveCidMap(bvid: BVID, pageList: BilibiliPagelistDetail[] | BilibiliPagelistDetailForEvent[] ): void {
    if (!bvid || !pageList || !Array.isArray(pageList)) {
        console.error("[BSB] Invalid data for saveCidMap", { bvid, pageList });
        return;
    }

    try {
        const map = cache.computeIfNotExists(bvid);
        for (const pageEntity of pageList) {
            if (pageEntity && pageEntity.page !== undefined && pageEntity.cid) {
                map.set(pageEntity.page, pageEntity.cid);
            }
        }
    } catch (error) {
        console.error("[BSB] Error saving CID map:", error);
    }
}

export function getCidMap(bvid: BVID): Map<number, CID> {
    if (!bvid) {
        console.error("[BSB] Invalid BVID provided to getCidFromBvIdPage");
        return null;
    }
    // Try to get CID from window state if available
    if (window?.__INITIAL_STATE__?.videoData?.pages && window?.__INITIAL_STATE__?.bvid === bvid) {
        saveCidMap(bvid, window.__INITIAL_STATE__.videoData.pages);
    } else if (window?.__INITIAL_STATE__?.videoInfo?.pages && window?.__INITIAL_STATE__?.toBvid === bvid) {
        saveCidMap(bvid, window.__INITIAL_STATE__.videoInfo.pages);
    }

    const result = cache.getFromCache(bvid);
    return result || new Map();
}

export function getCidFromBvIdPage(bvid: BVID, page?: number): CID | null {
    if (!page) {
        page = 1;
    }
    const result = getCidMap(bvid)?.get(page);
    return result || null;
}
