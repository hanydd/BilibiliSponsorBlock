import { BvID, Category, CategorySkipOption, VideoID } from "../types";
import Utils from "../utils";
import { getVideoIDHash } from "../utils/hash";
import { logWarn } from "../utils/logger";
import { asyncRequestToServer } from "./requests";

const utils = new Utils();

export interface LabelCacheEntry {
    timestamp: number;
    videos: Record<BvID, Category>;
}

const labelCache: Record<string, LabelCacheEntry> = {};
const cacheLimit = 1000;

async function getLabelHashBlock(hashPrefix: string, refreshCache: boolean = false): Promise<LabelCacheEntry | null> {
    // Check cache
    const cachedEntry = labelCache[hashPrefix];
    if (cachedEntry && !refreshCache) {
        return cachedEntry;
    }

    const response = await asyncRequestToServer("GET", `/api/videoLabels/${hashPrefix}`, {}, refreshCache);
    if (response.status !== 200) {
        // No video labels or server down
        labelCache[hashPrefix] = {
            timestamp: Date.now(),
            videos: {},
        };
        return null;
    }

    try {
        const data = JSON.parse(response.responseText);

        const newEntry: LabelCacheEntry = {
            timestamp: Date.now(),
            videos: Object.fromEntries(data.map((video) => [video.videoID, video.segments[0].category])),
        };
        labelCache[hashPrefix] = newEntry;

        if (Object.keys(labelCache).length > cacheLimit) {
            // Remove oldest entry
            const oldestEntry = Object.entries(labelCache).reduce((a, b) => (a[1].timestamp < b[1].timestamp ? a : b));
            delete labelCache[oldestEntry[0]];
        }

        return newEntry;
    } catch (e) {
        logWarn(`Error parsing video labels: ${e}`);

        return null;
    }
}

export async function getVideoLabel(videoID: VideoID, refreshCache: boolean = false): Promise<Category | null> {
    const prefix = (await getVideoIDHash(videoID)).slice(0, 3);
    const result = await getLabelHashBlock(prefix, refreshCache);

    if (result) {
        const category = result.videos[videoID.bvid];
        if (category && utils.getCategorySelection(category).option !== CategorySkipOption.Disabled) {
            return category;
        } else {
            return null;
        }
    }

    return null;
}
