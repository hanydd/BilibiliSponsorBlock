import Config from "../config";
import { ActionType, SponsorSourceType, SponsorTime, SponsorTimeHashedID, VideoID } from "../types";
import { DataCache } from "../utils/cache";
import { getVideoIDHash, HashedValue } from "../utils/hash";
import { asyncRequestToServer } from "./requests";

const segmentCache = new DataCache<VideoID, SegmentResponse>(() => {
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
    videoID: string,
    extraRequestData: Record<string, unknown> = {},
    ignoreCache: boolean = false
): Promise<SegmentResponse> {
    if (ignoreCache) {
        segmentCache.delete(videoID);
    }
    const cachedData = segmentCache.getFromCache(videoID);
    if (cachedData) {
        return cachedData;
    }

    const categories: string[] = Config.config.categorySelections.map((category) => category.name);
    const hashPrefix = (await getVideoIDHash(videoID)).slice(0, 4) as VideoID & HashedValue;
    const response = await getSegmentsByHash(hashPrefix, extraRequestData, ignoreCache);

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
        segmentCache.set(segmentResponse.videoID, { segments: segment, status: response.status });
        if (videoID == segmentResponse.videoID) {
            responseSegments.segments = segment;
        }
    }
    segmentCache.set(videoID, responseSegments);
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
