import { getHash } from "../../maze-utils/src/hash";
import { VideoID } from "../types";
import { asyncRequestToServer } from "../utils/requests";

interface RequestOptions {
    bypassCache?: boolean;
}

export interface PortVideoRecord {
    bvID: VideoID;
    ytbID: VideoID;
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
        if (responseData?.bvID == bvID) {
            return responseData;
        }
    } else if (response?.status == 404) {
        return null;
    }
    throw response;
}
