import { getBvIDfromAvIDBiliApi } from "../requests/bilibiliApi";
import { BiliVideoDetail } from "../requests/type/BilibiliRequestType";
import { VideoID } from "../types";
import { CalculateAvidToBvid } from "../utils/bvidAvidUtils";
import { DataCache } from "../utils/cache";

const cache = new DataCache<string, VideoID>();

export function saveAidFromDetail(detail: BiliVideoDetail): void {
    saveAid(detail.aid, detail.bvid);
}

export function saveAid(aid: number | string, bvid: VideoID): void {
    if (typeof aid === "string" && aid.startsWith("av")) {
        aid = aid.replace("av", "");
    }
    cache.set(aid.toString(), bvid);
}

export async function getBvid(aid: number | string): Promise<VideoID> {
    if (typeof aid === "string" && aid.startsWith("av")) {
        aid = aid.replace("av", "");
    }
    if (window?.__INITIAL_STATE__?.aid && window.__INITIAL_STATE__.bvid) {
        saveAid(window.__INITIAL_STATE__.aid, window.__INITIAL_STATE__.bvid);
    }
    if (!cache.contains(aid.toString())) {
        let bvid: string;
        try {
            bvid = CalculateAvidToBvid(aid);
        } catch (e) {
            bvid = await getBvIDfromAvIDBiliApi(aid.toString());
        }

        if (bvid) {
            cache.set(aid.toString(), bvid);
        }
    }

    return cache.getFromCache(aid.toString());
}
