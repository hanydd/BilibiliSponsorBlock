import Config from "../../config";
import { ActionType, NewVideoID, SponsorSourceType, SponsorTime, SponsorTimeHashedID } from "../../types";
import { getVideoIDHash } from "../../utils/hash";
import { parseBvidAndCidFromVideoId } from "../../utils/videoIdUtils";
import { callAPI } from "../background-request-proxy";
import { FetchResponse, SegmentResponse } from "../type/requestType";
import { segmentsCache } from "./backgroundCache";

function getEnabledActionTypes(forceFullVideo = false): ActionType[] {
    const actionTypes = [ActionType.Skip, ActionType.Poi];
    if (Config.config.muteSegments) {
        actionTypes.push(ActionType.Mute);
    }
    if (Config.config.fullVideoSegments || forceFullVideo) {
        actionTypes.push(ActionType.Full);
    }
    return actionTypes;
}

async function fetchSegmentsByHash(
    hashPrefix: string,
    extraRequestData: Record<string, unknown>,
    ignoreCache: boolean
): Promise<FetchResponse> {
    if (ignoreCache) {
        await segmentsCache.delete(hashPrefix);
    } else {
        const cachedData = await segmentsCache.get(hashPrefix, true);
        if (cachedData) {
            return cachedData;
        }
    }

    const response = await callAPI("GET", `/api/skipSegments/${hashPrefix}`, extraRequestData, ignoreCache);
    if (response.status == 200 || response.status == 404) {
        await segmentsCache.set(hashPrefix, response);
    }
    return response;
}

export async function getSegmentsBackground(
    videoID: NewVideoID,
    extraRequestData: Record<string, unknown> = {},
    ignoreCache: boolean = false
): Promise<SegmentResponse> {
    const { bvId } = parseBvidAndCidFromVideoId(videoID);
    if (!bvId) {
        return { segments: null, status: 404 };
    }

    const categories: string[] = Config.config.categorySelections.map((category) => category.name);
    const hashPrefix = (await getVideoIDHash(bvId)).slice(0, 4);
    const response = await fetchSegmentsByHash(hashPrefix, extraRequestData, ignoreCache);

    const responseSegments: SegmentResponse = { segments: null, status: response.status };
    if (!response?.ok) {
        return responseSegments;
    }

    const allSegments: SponsorTimeHashedID[] = JSON.parse(response?.responseText);

    for (const segmentResponse of allSegments) {
        const segment = segmentResponse.segments
            ?.filter(
                (segment: SponsorTime) =>
                    getEnabledActionTypes().includes(segment.actionType) && categories.includes(segment.category)
            )
            ?.map((segment: SponsorTime) => ({
                ...segment,
                source: SponsorSourceType.Server,
            }))
            ?.sort((a: SponsorTime, b: SponsorTime) => a.segment[0] - b.segment[0]);

        if (bvId == segmentResponse.videoID) {
            responseSegments.segments = segment;
        }
    }

    return responseSegments;
}
