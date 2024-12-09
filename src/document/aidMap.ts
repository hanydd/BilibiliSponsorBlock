import { BiliVideoDetail } from "../requests/type/BilibiliRequestType";
import { VideoID } from "../types";
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

export function getBvid(aid: number | string): VideoID {
    if (window?.__INITIAL_STATE__?.aid && window.__INITIAL_STATE__.bvid) {
        saveAid(window.__INITIAL_STATE__.aid, window.__INITIAL_STATE__.bvid);
    }
    return cache.getFromCache(aid.toString());
}
