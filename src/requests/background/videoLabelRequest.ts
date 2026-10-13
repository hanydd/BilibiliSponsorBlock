import Config from "../../config";
import { isCategoryEnabled } from "../../config/categoryConfig";
import { BVID, Category, NewVideoID } from "../../types";
import { getVideoIDHash } from "../../utils/hash";
import { parseBvidAndCidFromVideoId } from "../../utils/videoIdUtils";
import { getConfiguredBackends, requestFromBackend } from "../backendRouter";
import { LabelBlock } from "../type/requestType";
import { videoLabelCache } from "./backgroundCache";

async function fetchLabelBlock(prefix: string, skipServerCache: boolean): Promise<LabelBlock> {
    const backends = getConfiguredBackends().filter((backend) => backend.capabilities.includes("GET /api/videoLabels/:sha256HashPrefix"));
    const results = await Promise.all(backends.map(async backend => {
        const response = await requestFromBackend(backend, "GET", `/api/videoLabels/${prefix}`, {}, skipServerCache);
        if (response.status === 404) return {} as LabelBlock;
        if (!response.ok || response.status !== 200) return null;
        try {
            const data: Array<{ videoID: BVID; segments: Array<{ category: Category }> }> = JSON.parse(response.responseText);
            return Object.fromEntries((data || []).map(video => [video.videoID, video.segments?.[0]?.category]).filter(([, category]) => !!category)) as LabelBlock;
        } catch {
            return null;
        }
    }));
    if (!results.length || results.some(result => result === null)) return null;
    return Object.assign({}, ...results);
}

async function getOrFetchLabelBlock(prefix: string, refreshCache: boolean): Promise<LabelBlock> {
    const cached = await videoLabelCache.get(prefix, true);
    if (cached && !refreshCache) return cached;

    const block = await fetchLabelBlock(prefix, refreshCache);
    if (block) {
        await videoLabelCache.set(prefix, block);
        return block;
    }
    return {} as LabelBlock;
}

export async function getVideoLabelBackground(videoID: NewVideoID, refreshCache: boolean): Promise<Category | null> {
    const { bvId } = parseBvidAndCidFromVideoId(videoID);
    if (!bvId) return null;

    const prefix = (await getVideoIDHash(bvId)).slice(0, 4);
    const block = await getOrFetchLabelBlock(prefix, refreshCache);
    const category = block?.[bvId];
    if (!category) return null;

    return isCategoryEnabled(Config?.config?.categorySelections?.find(selection => selection.name === category)) ? category : null;
}
