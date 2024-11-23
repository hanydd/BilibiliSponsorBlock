import { AID, VideoID } from "../types";

export async function getBvIDfromAvIDBiliApi(avID: AID): Promise<VideoID | null> {
    try {
        const response = await fetch(`https://api.bilibili.com/x/web-interface/view?aid=${avID}`);
        if (!response.ok) {
            return null;
        }
        const payload = await response.json();
        if (payload.code !== 0) {
            throw "Failed to get BV id via bilibili API: " + payload.message;
        }
        const bvID = payload.data.bvid as VideoID;
        return bvID;
    } catch (e) {
        console.error(e);
        return null;
    }
}
