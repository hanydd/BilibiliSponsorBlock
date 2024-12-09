import { BiliPlayInfo } from "../requests/type/BilibiliRequestType";
import { DataCache } from "../utils/cache";

export interface PlayInfo {
    id: number;
    frameRate: number;
}

const playInfoCache = new DataCache<string, PlayInfo[]>(() => []);

export function playUrlResponseToPlayInfo(playUrlInfo: BiliPlayInfo): PlayInfo[] {
    if (!playUrlInfo) {
        return null;
    }
    return playUrlInfo.dash.video.map((v) => ({ id: v.id, frameRate: parseInt(v.frameRate) }));
}

export function savePlayInfo(cid: string, playInfo: PlayInfo[]): void {
    playInfoCache.set(cid, playInfo);
}

export function getPlayInfo(): PlayInfo[] {
    if (window.__playinfo__?.data?.dash?.video) {
        return playUrlResponseToPlayInfo(window.__playinfo__?.data);
    } else if (playInfoCache.getFromCache(window?.__INITIAL_STATE__?.cid.toString())) {
        return playInfoCache.getFromCache(window.__INITIAL_STATE__.cid.toString());
    }
    return [];
}

export function getFrameRate(): number {
    let currentQuality = null;
    try {
        currentQuality ||= JSON.parse(window?.localStorage?.bpx_player_profile)?.media?.quality;
    } catch (e) {
        console.debug("Failed to get current quality", e);
    }
    currentQuality = currentQuality ?? window?.__playinfo__?.data?.quality;

    const possibleQuality = getPlayInfo().filter((v) => v.id === currentQuality && !!v.frameRate);

    if (possibleQuality.length > 0) {
        return possibleQuality[0].frameRate;
    }
    return 30;
}
