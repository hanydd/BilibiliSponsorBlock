import { NewVideoID, BVID, CID } from "../types";

export function parseBvidAndCidFromVideoId(videoId: NewVideoID): { bvId: BVID; cid: CID } {
    // Add null check
    if (!videoId) {
        return { bvId: null as unknown as BVID, cid: null as unknown as CID };
    }
    const [bvId, cid] = videoId.split("+");
    return { bvId: bvId as BVID, cid: cid as CID };
}