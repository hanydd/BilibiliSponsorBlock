import Config from "../config";
import { PortVideo, BVID, YTID, NewVideoID } from "../types";
import { getHash } from "../utils/hash";
import { FetchResponse } from "./background-request-proxy";
import { asyncRequestToServer } from "./requests";

interface RequestOptions {
    bypassCache?: boolean;
}

export interface PortVideoRecord {
    bvID: BVID;
    ytbID: BVID;
    UUID: string;
    votes: number;
    locked: boolean;
}
export async function getPortVideo(bvID: BVID, options: RequestOptions = {}): Promise<PortVideoRecord> {
    const response = await asyncRequestToServer("GET", "/api/portVideo", { videoID: bvID }, options?.bypassCache).catch(
        (e) => e
    );
    if (response && response?.ok) {
        const responseData = JSON.parse(response?.responseText) as PortVideoRecord;
        if (responseData?.bvID == bvID) {
            return responseData;
        }
    } else if (response?.status == 404) {
        return null;
    }
    throw response;
}

export async function getPortVideoByHash(bvID: BVID, options: RequestOptions = {}): Promise<PortVideoRecord> {
    const hashedPrefix = (await getHash(bvID, 1)).slice(0, 3);
    const response = await asyncRequestToServer("GET", `/api/portVideo/${hashedPrefix}`, options?.bypassCache).catch(
        (e) => e
    );
    if (response && response?.ok) {
        const responseData = JSON.parse(response?.responseText) as PortVideoRecord[];
        const portVideo = responseData.filter((portVideo) => portVideo.bvID == bvID);
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

export async function postPortVideo(bvID: NewVideoID, ytbID: YTID, duration: number): Promise<PortVideoRecord> {
    const response = await asyncRequestToServer("POST", "/api/portVideo", {
        bvID: bvID,
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

export async function updatePortedSegments(bvID: NewVideoID, UUID: string): Promise<FetchResponse> {
    return asyncRequestToServer("POST", "/api/updatePortedSegments", { videoID: bvID, UUID: UUID });
}
