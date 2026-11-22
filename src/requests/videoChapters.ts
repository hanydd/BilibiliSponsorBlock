import { NewVideoID } from "../types";
import { parseBvidAndCidFromVideoId } from "../utils/videoIdUtils";
import { BilibiliResponse, BiliVideoChapter } from "./type/BilibiliRequestType";

export async function getVideoChapters(videoID: NewVideoID): Promise<BiliVideoChapter[]> {
    const { bvId, cid } = parseBvidAndCidFromVideoId(videoID);
    if (!bvId || !cid) return [];

    const query = new URLSearchParams({ bvid: bvId, cid });
    try {
        const response = await fetch(`https://api.bilibili.com/x/player/v2?${query}`);
        if (!response.ok) return [];

        const { code, data }: BilibiliResponse<{ cid: number; view_points?: BiliVideoChapter[] }> = await response.json();
        if (code !== 0 || String(data?.cid) !== cid || !Array.isArray(data?.view_points)) return [];

        return data.view_points.filter((chapter) =>
            Number.isFinite(chapter?.from) && Number.isFinite(chapter?.to) &&
            chapter.from >= 0 && chapter.to > chapter.from &&
            typeof chapter.content === "string" && chapter.content.trim().length > 0
        ).sort((first, second) => first.from - second.from);
    } catch {
        return [];
    }
}
