import { NewVideoID, BVID, CID } from "../types";

export function parseBvidAndCidFromVideoId(videoId: NewVideoID): { bvId: BVID; cid: CID } {
    const [bvId, cid] = videoId.split("+");
    return { bvId: bvId as BVID, cid: cid as CID };
}