import { BilibiliPagelistDetail } from "../requests/type/BilibiliRequestType";
import { BVID, CID } from "../types";
import { DataCache } from "../utils/cache";

const cache = new DataCache<BVID, Record<number, CID>>("cid_map", () => ({}));

export function saveCidMap(bvid: BVID, pageList: BilibiliPagelistDetail[]): void {
    const map = cache.computeIfNotExists(bvid, () => ({}));
    for (const page of pageList) {
        map[page.page] = page.cid;
    }
}

export async function getCidFromBvIdPage(bvid: BVID, page?: number): Promise<CID> {

    if (window?.__INITIAL_STATE__?.videoData?.pages && window?.__INITIAL_STATE__?.bvid) {
        saveCidMap(window.__INITIAL_STATE__.bvid, window.__INITIAL_STATE__.videoData.pages);
    }

    if (!page) {
        page = 1;
    }
    return cache.getFromCache(bvid)?.[page];
}
