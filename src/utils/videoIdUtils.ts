import { NewVideoID, BVID, CID } from "../types";

export function parseBvidAndCidFromVideoId(videoId: NewVideoID): { bvId: BVID; cid: CID | null } {
    if (!videoId) {
        return { bvId: null as unknown as BVID, cid: null };
    }
    const [bvId, cid = null] = videoId.split("+") as [BVID, CID?];
    return { bvId, cid };
}
