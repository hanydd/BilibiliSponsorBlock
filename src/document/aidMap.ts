import { BiliVideoDetail } from "../requests/type/BilibiliRequestType";
import { AID, BVID } from "../types";
import { CalculateAvidToBvid } from "../utils/bvidAvidUtils";
import { DataCache } from "../utils/cache";

const cache = new DataCache<string, BVID>();

export function saveAidFromDetail(detail: BiliVideoDetail): void {
    saveAid(detail.aid, detail.bvid);
}

export function saveAid(aid: number | string, bvid: BVID): void {
    if (typeof aid === "string" && aid.startsWith("av")) {
        aid = aid.replace("av", "");
    }
    cache.set(aid as AID, bvid);
}

export async function getBvid(aid: number | string): Promise<BVID> {
    if (typeof aid === "string" && aid.startsWith("av")) {
        aid = aid.replace("av", "");
    }
    if (window?.__INITIAL_STATE__?.aid && window.__INITIAL_STATE__.bvid) {
        saveAid(window.__INITIAL_STATE__.aid, window.__INITIAL_STATE__.bvid);
    }
    if (!cache.contains(aid as AID)) {
        let bvid: BVID;
        try {
            bvid = CalculateAvidToBvid(aid);
        } catch (e) {
            console.error("Failed to calculate bvid from aid: " + aid, e);
        }

        if (bvid) {
            cache.set(aid as AID, bvid);
        }
    }

    return cache.getFromCache(aid as AID);
}
