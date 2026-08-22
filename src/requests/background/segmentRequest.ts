import Config from "../../config";
import { ActionType, NewVideoID, SponsorSourceType, SponsorTime, SponsorTimeHashedID } from "../../types";
import {
    BackendConfig,
    BackendSegmentResult,
    VideoMatchContext,
    mergeBackendSegments,
    selectMatchedBackends,
    supportsBackendOperation,
    createBackendInfoMap,
    createBackendInfoMap,
} from "../../backends";
import { getVideoIDHash } from "../../utils/hash";
import { parseBvidAndCidFromVideoId } from "../../utils/videoIdUtils";
import { getConfiguredSnapshot, requestFromBackend } from "../backendRouter";
import { FetchResponse, SegmentResponse } from "../type/requestType";
import { segmentsCache } from "./backgroundCache";

function getEnabledActionTypes(forceFullVideo = false): ActionType[] {
    const actionTypes = [ActionType.Skip, ActionType.Poi];
    if (Config.config.muteSegments) actionTypes.push(ActionType.Mute);
    if (Config.config.fullVideoSegments || forceFullVideo) actionTypes.push(ActionType.Full);
    return actionTypes;
}

function parseSegments(responseText: string, bvId: string): SponsorTime[] | null {
    try {
        const parsed = JSON.parse(responseText) as unknown;
        if (!Array.isArray(parsed)) return null;
        if (parsed.length === 0) return [];

        const first = parsed[0];
        if (first && typeof first === "object" && "videoID" in first) {
            const hashedResults = parsed as SponsorTimeHashedID[];
            return hashedResults.find((item) => item.videoID === bvId)?.segments ?? [];
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
    videoContext: VideoMatchContext,
    ignoreCache: boolean
): Promise<FetchResponse> {
    const hashPrefix = (await getVideoIDHash(bvId)).slice(0, 4);
    const configVersion = JSON.stringify(
        backends.map(({ id, api_url, capabilities, match, mirrors, conflicts }) => ({
            id,
            api_url,
            capabilities,
            match,
            mirrors,
            conflicts,
        }))
    );
    const cacheKey = `${hashPrefix}:${configVersion}:${JSON.stringify(videoContext)}`;
    if (ignoreCache) {
        await segmentsCache.delete(cacheKey);
    } else {
        const cachedData = await segmentsCache.get(cacheKey, true);
        if (cachedData) return cachedData;
    }

    const responses = await Promise.all(
        backends.map(async (backend, priority) => {
            const response = await requestFromBackend(backend, "GET", "/api/skipSegments", { videoID: bvId, cid }, ignoreCache);
            const segments = response.ok ? parseSegments(response.responseText, bvId) : null;
            return { backend, priority, response, segments };
        })
    );

    const results: BackendSegmentResult[] = responses
        .filter((result): result is typeof result & { segments: SponsorTime[] } => result.segments !== null)
        .map(({ backend, priority, segments }) => ({ backendId: backend.id, priority, segments }));

    if (results.length > 0) {
        const merged = mergeBackendSegments(results).map((segment) => ({ ...segment, source: SponsorSourceType.Server }));
        const response: FetchResponse = { responseText: JSON.stringify(merged), status: 200, ok: true };
        await segmentsCache.set(cacheKey, response);
        return response;
    }

    return responses.at(-1)?.response ?? { responseText: "", status: -1, ok: false };
}

export async function getSegmentsBackground(
    videoID: NewVideoID,
    ignoreCache = false,
    videoContext?: VideoMatchContext
): Promise<SegmentResponse> {
    const { bvId, cid } = parseBvidAndCidFromVideoId(videoID);
    if (!bvId) return { segments: null, status: 404 };

    const categories: string[] = Config.config.categorySelections.map((category) => category.name);
    const context: VideoMatchContext = {
        bvid: bvId,
        title: videoContext?.title ?? "",
        description: videoContext?.description ?? "",
        up_mid: videoContext?.up_mid ?? "",
        up_name: videoContext?.up_name ?? "",
    };
    const configuredBackends = (getConfiguredSnapshot()?.backends ?? []) as unknown as BackendConfig[];
    const enabledMap = (Config.local?.backendEnabledMap ?? {}) as Record<string, boolean>;
    const matchedBackends = selectMatchedBackends(configuredBackends, context, enabledMap).filter((backend) =>
        supportsBackendOperation(backend, "querySegments")
    );
    const response = await fetchSegmentsByBackends(bvId, cid, matchedBackends, context, ignoreCache);

    const responseSegments: SegmentResponse = { segments: null, status: response.status };
    if (!response.ok) return responseSegments;

    responseSegments.backendInfo = createBackendInfoMap(matchedBackends);
    const mergedSegments = parseSegments(response.responseText, bvId) ?? [];
    responseSegments.segments = mergedSegments
        .filter((segment) => getEnabledActionTypes().includes(segment.actionType) && categories.includes(segment.category))
        .sort((a, b) => a.segment[0] - b.segment[0]);

    return responseSegments;
}
