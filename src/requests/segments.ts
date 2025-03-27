import Config from "../config";
import { ActionType, SponsorSourceType, SponsorTime, SponsorTimeHashedID, BVID, NewVideoID } from "../types";
import { DataCache } from "../utils/cache";
import { getVideoIDHash, HashedValue } from "../utils/hash";
import { parseBvidAndCidFromVideoId } from "../utils/videoIdUtils";
import { asyncRequestToServer } from "./requests";

const segmentCache = new DataCache<BVID, SegmentResponse>(null, () => {
    return {
        segments: null,
        status: 200,
    };
}, 20);

export interface SegmentResponse {
    segments: SponsorTime[] | null;
    status: number;
}

export async function getSegmentsByHash(
    hashPrefix: string,
    extraRequestData: Record<string, unknown>,
    ignoreCache: boolean
) {
    const response = await asyncRequestToServer(
        "GET",
        "/api/skipSegments/" + hashPrefix,
        extraRequestData,
        ignoreCache
    );

    return response;
}

export async function getSegmentsByVideoID(
    videoID: NewVideoID,
    extraRequestData: Record<string, unknown> = {},
    ignoreCache: boolean = false
): Promise<SegmentResponse> {
    const { bvId } = parseBvidAndCidFromVideoId(videoID);
    if (ignoreCache) {
        segmentCache.delete(bvId);
    }
    const cachedData = segmentCache.getFromCache(bvId);
    if (cachedData) {
        return cachedData;
    }

    const categories: string[] = Config.config.categorySelections.map((category) => category.name);
    const hashPrefix = (await getVideoIDHash(bvId)).slice(0, 4) as BVID & HashedValue;
    const response = await getSegmentsByHash(hashPrefix, extraRequestData, ignoreCache);

    const responseSegments: SegmentResponse = { segments: null, status: response.status };
    if (!response?.ok) {
        segmentCache.set(bvId, responseSegments);
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
        segmentCache.set(segmentResponse.videoID, { segments: segment, status: response.status });
        if (bvId == segmentResponse.videoID) {
            responseSegments.segments = segment;
        }
    }
    segmentCache.set(bvId, responseSegments);
    return responseSegments;
}

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
