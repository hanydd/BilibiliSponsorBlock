import Config from "../config";
import { NewVideoID, PortVideo, YTID } from "../types";
import { getHash } from "../utils/hash";
import { parseBvidAndCidFromVideoId } from "../utils/videoIdUtils";
import { FetchResponse } from "./type/requestType";
import { asyncRequestToServer } from "./requests";

interface RequestOptions {
    bypassCache?: boolean;
}

export async function getPortVideoByHash(videoId: NewVideoID, options: RequestOptions = {}): Promise<PortVideo> {
    const { bvId, cid } = parseBvidAndCidFromVideoId(videoId);
    const hashedPrefix = (await getHash(bvId, 1)).slice(0, 4);
    const response = await asyncRequestToServer("GET", `/api/portVideo/${hashedPrefix}`, options?.bypassCache).catch(
        (e) => e
    );
    if (response && response?.ok) {
        const responseData = JSON.parse(response?.responseText) as PortVideo[];
        const portVideo = responseData.filter((portVideo) => portVideo.bvID == bvId && portVideo.cid == cid);
        if (portVideo.length > 0) {
            return portVideo[0];
        } else {
            return null;
        }
    } else if (response?.status == 404) {
        return null;
    }
    throw response;
}

export async function postPortVideo(videoId: NewVideoID, ytbID: YTID, duration: number): Promise<PortVideo> {
    const { bvId, cid } = parseBvidAndCidFromVideoId(videoId);
    const response = await asyncRequestToServer("POST", "/api/portVideo", {
        bvID: bvId,
        cid: cid,
        ytbID,
        biliDuration: duration,
        userID: Config.config.userID,
        userAgent: `${chrome.runtime.id}/v${chrome.runtime.getManifest().version}`,
    });
    if (response?.ok) {
        return JSON.parse(response.responseText) as PortVideo;
    } else {
        throw response.responseText;
    }
}

export async function postPortVideoVote(UUID: string, bvID: NewVideoID, voteType: number) {
    const response = await asyncRequestToServer("POST", "/api/votePort", {
        UUID: UUID,
        bvID: bvID,
        userID: Config.config.userID,
        type: voteType,
    });
    if (!response?.ok) {
        throw response?.responseText ? response.responseText : "投票失败！";
    }
}

export async function updatePortedSegments(videoID: NewVideoID, UUID: string): Promise<FetchResponse> {
    const { bvId, cid } = parseBvidAndCidFromVideoId(videoID);
    return asyncRequestToServer("POST", "/api/updatePortedSegments", { videoID: bvId, UUID: UUID, cid: cid });
}
