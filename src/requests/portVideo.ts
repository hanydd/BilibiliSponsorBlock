import { VideoID } from "../types";
import { getHash } from "../utils/hash";
import { FetchResponse } from "./background-request-proxy";
import { VideoID, YoutubeID } from "../types";
import { getVideoIDHash } from "../utils/hash";
import { asyncRequestToServer } from "./requests";

interface RequestOptions {
    bypassCache?: boolean;
}

export interface PortVideoRecord {
    videoID: VideoID;
    ytbID: YoutubeID;
    UUID: string;
    votes: number;
    locked: boolean;
}

export async function getPortVideo(bvID: VideoID, options: RequestOptions = {}): Promise<PortVideoRecord> {
    const response = await asyncRequestToServer("GET", "/api/portVideo", { videoID: bvID }, options?.bypassCache).catch(
        (e) => e
    );
    if (response && response?.ok) {
        const responseData = JSON.parse(response?.responseText) as PortVideoRecord;
        if (responseData?.videoID == bvID) {
            return responseData;
        }
    } else if (response?.status == 404) {
        return null;
    }
    throw response;
}

export async function getPortVideoByHash(videoID: VideoID, options: RequestOptions = {}): Promise<PortVideoRecord> {
    const hashedBvID = await getVideoIDHash(videoID);
    const response = await asyncRequestToServer(
        "GET",
        `/api/portVideo/${hashedBvID.slice(0, 3)}`,
        options?.bypassCache
    ).catch((e) => e);
    if (response && response?.ok) {
        const responseData = JSON.parse(response?.responseText) as PortVideoRecord[];
        // TODO video id equality check
        const portVideo = responseData.filter((portVideo) => portVideo.videoID == videoID);
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

export async function updatePortedSegments(bvID: VideoID): Promise<FetchResponse> {
    return asyncRequestToServer("POST", "/api/updatePortedSegments", { videoID: bvID });
}
