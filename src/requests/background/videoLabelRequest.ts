import Config from "../../config";
import { Category, CategorySkipOption, NewVideoID, SponsorTimeHashedID } from "../../types";
import { getVideoIDHash } from "../../utils/hash";
import { parseBvidAndCidFromVideoId } from "../../utils/videoIdUtils";
import { callAPI } from "../background-request-proxy";
import { LabelBlock } from "../type/requestType";
import { videoLabelCache } from "./backgroundCache";

async function fetchLabelBlock(prefix: string, skipServerCache: boolean): Promise<LabelBlock> {
    const response = await callAPI(
        "GET",
        `/api/skipSegments/${prefix}`,
        { categories: '["sponsor","selfpromo","exclusive_access"]', actionType: "full" },
        skipServerCache
    );

    if (!response.ok || response.status !== 200) return {} as LabelBlock;

    const data = JSON.parse(response.responseText) as SponsorTimeHashedID[];
    const block: LabelBlock = Object.fromEntries(
        (data || []).map((video) => [video.videoID, video.segments?.[0]?.category as Category]).filter(([, c]) => !!c)
    ) as LabelBlock;
    return block;
}

async function getOrFetchLabelBlock(prefix: string, refreshCache: boolean): Promise<LabelBlock> {
    const cached = await videoLabelCache.get(prefix, true);
    if (cached && !refreshCache) return cached;

    const block = await fetchLabelBlock(prefix, refreshCache);
    await videoLabelCache.set(prefix, block);
    return block;
}

function isCategoryEnabled(category: Category): boolean {
    const selections = Config?.config?.categorySelections ?? [];
    const selection = selections.find((s) => s.name === category);
    const option = selection?.option ?? CategorySkipOption.Disabled;
    return option !== CategorySkipOption.Disabled;
}

export async function getVideoLabelBackground(videoID: NewVideoID, refreshCache: boolean): Promise<Category | null> {
    const { bvId } = parseBvidAndCidFromVideoId(videoID);
    if (!bvId) return null;

    const prefix = (await getVideoIDHash(bvId)).slice(0, 4);
    const block = await getOrFetchLabelBlock(prefix, refreshCache);
    const category = block?.[bvId];
    if (!category) return null;

    return isCategoryEnabled(category) ? category : null;
}
