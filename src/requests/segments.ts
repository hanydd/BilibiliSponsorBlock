import Config from "../config";
import { ActionType, SponsorSourceType, SponsorTime, SponsorTimeHashedID, BVID, NewVideoID, Category, CategorySkipOption } from "../types";
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

    let responseSegments: SegmentResponse = { segments: null, status: response.status };
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

    if (Config.config.categorySelections.find(category => category.name === "filtered_category")?.option === CategorySkipOption.ShowOverlay) 
        responseSegments = markLowVoteOverlappingSegments(responseSegments);

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

function hasOverlapAtLeast(a: number[], b: number[]): boolean {
    const overlap = Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
    return overlap >= Config.config.filteredBetterCategoryTime;
}

function markLowVoteOverlappingSegments(data: SegmentResponse): SegmentResponse {
    const segments = data.segments.map((s, i) => ({ ...s, __index: i }));

    if (Config.config.filteredBetterCategoryTime !== 0) {
        for (let i = 0; i < segments.length; i++) {
            for (let j = i + 1; j < segments.length; j++) {
                const segA = segments[i];
                const segB = segments[j];

                if (Config.config.filteredBetterCategoryDifferentCategory && segA.category === segB.category) continue;

                if (hasOverlapAtLeast(segA.segment, segB.segment)) {
                    if (segA.votes === segB.votes) {
                        // 相同票数则随机
                        if (Math.random() > 0.5) {
                            segB.category = "filtered_category" as Category;
                        } else {
                            segA.category = "filtered_category" as Category;
                        }
                    } else if (segA.votes > segB.votes) {
                        segB.category = "filtered_category" as Category;
                    } else {
                        segA.category = "filtered_category" as Category;
                    }
                }
            }
        }
    } 

    if (Config.config.filteredBetterCategoryVote) {
        for (const segment of segments) {
            if (
                segment.votes < Config.config.filteredBetterCategoryVoteNumber &&
                segment.category !== "filtered_category"
            ) {
                segment.category = "filtered_category" as Category;
            }
        }
    }

    const cleaned = segments.map(({ __index, ...rest }) => rest);
    return { ...data, segments: cleaned };
}
