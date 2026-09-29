import Config from "../config";
import { SponsorTime } from "../types";

/** 片段集合的 UUID 集合（notice 去重/匹配共用）。 */
function segmentUUIDSet(segments: SponsorTime[]): Set<string> {
    return new Set(segments.map((s) => s.UUID));
}

/** b 的 UUID 是否全部出现在 a 中（子集判定）：合并体去重共用。 */
export function noticeSegmentsContain(a: SponsorTime[], b: SponsorTime[]): boolean {
    const aUUIDs = segmentUUIDSet(a);
    return b.every((s) => aUUIDs.has(s.UUID));
}

/** 两个片段集合是否共享任一 UUID：按片段选择性关闭 notice 共用。 */
export function noticeSegmentsIntersect(a: SponsorTime[], b: SponsorTime[]): boolean {
    const bUUIDs = segmentUUIDSet(b);
    return a.some((s) => bUUIDs.has(s.UUID));
}

export enum SkipNoticeAction {
    None,
    Upvote,
    Downvote,
    CategoryVote,
    CopyDownvote,
    Unskip0,
    Unskip1,
}

export function downvoteButtonColor(
    segments: SponsorTime[],
    actionState: SkipNoticeAction,
    downvoteType: SkipNoticeAction
): string {
    // Also used for "Copy and Downvote"
    if (segments?.length > 1) {
        return actionState === downvoteType ? Config.config.colorPalette.red : Config.config.colorPalette.white;
    } else {
        // You dont have segment selectors so the lockbutton needs to be colored and cannot be selected.
        return Config.config.isVip && segments?.[0].locked === 1
            ? Config.config.colorPalette.locked
            : Config.config.colorPalette.white;
    }
}
