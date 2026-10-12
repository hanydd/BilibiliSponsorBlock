import Config from "../../config";
import { isCategoryEnabled } from "../../config/categoryConfig";
import { ActionType, NewVideoID, SponsorSourceType, SponsorTime, SponsorTimeHashedID } from "../../types";
import { BackendConfig, BackendSegmentResult, VideoMatchContext, createBackendInfoMap, mergeBackendSegments } from "../../backends";
import { getVideoIDHash } from "../../utils/hash";
import { parseBvidAndCidFromVideoId } from "../../utils/videoIdUtils";
import { getEligibleBackends, requestFromBackend } from "../backendRouter";
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

function parseBackendSegments(responseText: string, bvId: string): SponsorTime[] | null {
    try {
        const parsed: unknown = JSON.parse(responseText);
        if (!Array.isArray(parsed)) return null;
        if (!parsed.length) return [];
        if (parsed[0] && typeof parsed[0] === "object" && "videoID" in parsed[0]) {
            return (parsed as SponsorTimeHashedID[]).find((entry) => entry.videoID === bvId)?.segments ?? [];
        }
        return parsed as SponsorTime[];
    } catch {
        return null;
    }
}

async function fetchSegmentsByBackends(
    bvId: string,
    cid: string,
    backends: BackendConfig[],
    context: VideoMatchContext,
    ignoreCache: boolean
): Promise<FetchResponse> {
    const hashPrefix = (await getVideoIDHash(bvId)).slice(0, 4);
    const configVersion = JSON.stringify(backends.map(({ id, api_url, capabilities, match, mirrors, conflicts }) => ({ id, api_url, capabilities, match, mirrors, conflicts })));
    const cacheKey = `${hashPrefix}:${cid}:${configVersion}:${JSON.stringify(context)}`;
    if (ignoreCache) {
        await segmentsCache.delete(cacheKey);
    } else {
        const cachedData = await segmentsCache.get(cacheKey, true);
        if (cachedData) return cachedData;
    }

    const responses = await Promise.all(backends.map(async (backend, priority) => {
        const response = await requestFromBackend(backend, "GET", "/api/skipSegments", { videoID: bvId, cid }, ignoreCache);
        const segments = response.status === 404 ? [] : response.ok ? parseBackendSegments(response.responseText, bvId) : null;
        return { backend, priority, response, segments };
    }));
    const results: BackendSegmentResult[] = responses
        .filter((item): item is typeof item & { segments: SponsorTime[] } => item.segments !== null)
        .map(({ backend, priority, segments }) => ({ backendId: backend.id, priority, segments }));

    if (results.length) {
        const merged = mergeBackendSegments(results).map((segment) => ({ ...segment, source: SponsorSourceType.Server }));
        const response: FetchResponse = { responseText: JSON.stringify(merged), status: 200, ok: true };
        if (responses.every((item) => item.segments !== null)) await segmentsCache.set(cacheKey, response);
        return response;
    }
    return responses.at(-1)?.response ?? { responseText: "", status: 404, ok: false };
}

export async function getSegmentsBackground(
    videoID: NewVideoID,
    ignoreCache: boolean = false,
    videoContext?: VideoMatchContext
): Promise<SegmentResponse> {
    const { bvId, cid } = parseBvidAndCidFromVideoId(videoID);
    if (!bvId) {
        return { segments: null, status: 404 };
    }

    const categories: string[] = Config.config.categorySelections.filter(isCategoryEnabled).map((category) => category.name);
    const context: VideoMatchContext = {
        bvid: bvId,
        title: videoContext?.title ?? "",
        description: videoContext?.description ?? "",
        up_mid: videoContext?.up_mid ?? "",
        up_name: videoContext?.up_name ?? "",
    };
    const backends = getEligibleBackends("querySegments", context) as BackendConfig[];
    const response = await fetchSegmentsByBackends(bvId, cid, backends, context, ignoreCache);

    const responseSegments: SegmentResponse = { segments: null, status: response.status };
    if (!response?.ok) {
        return responseSegments;
    }

    responseSegments.backendInfo = createBackendInfoMap(backends);
    const rawSegments = parseBackendSegments(response.responseText, bvId) ?? [];
    responseSegments.rawSegments = rawSegments;
    responseSegments.segments = rawSegments
        .filter((segment) => getEnabledActionTypes().includes(segment.actionType) && categories.includes(segment.category))
        .sort((a, b) => a.segment[0] - b.segment[0]);

    return responseSegments;
}
