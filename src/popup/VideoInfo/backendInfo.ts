import { BackendInfoMap } from "../../backends";
import { SponsorSourceType, SponsorTime } from "../../types";

export const VOTE_ON_SPONSOR_TIME_CAPABILITY = "POST /api/voteOnSponsorTime" as const;

export type PopupSegmentSource =
    | { kind: "backend"; name: string; backendId: string; canVote: boolean }
    | { kind: "local" }
    | { kind: "danmaku" }
    | { kind: "youtube" }
    | { kind: "unknown" };

export function getPopupSegmentSource(segment: SponsorTime, backendInfo: BackendInfoMap): PopupSegmentSource {
    if (segment.source === SponsorSourceType.Server) {
        if (!segment.backendId) return { kind: "unknown" };

        const info = backendInfo[segment.backendId];
        return {
            kind: "backend",
            name: info?.name ?? segment.backendId,
            backendId: segment.backendId,
            canVote: Boolean(info?.capabilities.includes(VOTE_ON_SPONSOR_TIME_CAPABILITY)),
        };
    }

    switch (segment.source) {
        case SponsorSourceType.Local:
            return { kind: "local" };
        case SponsorSourceType.Danmaku:
            return { kind: "danmaku" };
        case SponsorSourceType.YouTube:
            return { kind: "youtube" };
        default:
            return { kind: "unknown" };
    }
}

export function getPopupVoteBackendId(segment: SponsorTime, backendInfo: BackendInfoMap): string | undefined {
    const source = getPopupSegmentSource(segment, backendInfo);
    return source.kind === "backend" && source.canVote ? source.backendId : undefined;
}
