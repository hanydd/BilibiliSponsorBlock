import {
    getPopupSegmentSource,
    getPopupVoteBackendId,
    VOTE_ON_SPONSOR_TIME_CAPABILITY,
} from "../src/popup/VideoInfo/backendInfo";
import { ActionType, Category, SponsorSourceType, SponsorTime } from "../src/types";

function segment(source: SponsorSourceType, backendId?: string): SponsorTime {
    return {
        segment: [1, 2],
        cid: "1" as SponsorTime["cid"],
        UUID: "uuid" as SponsorTime["UUID"],
        category: "sponsor" as Category,
        actionType: ActionType.Skip,
        source,
        backendId,
    };
}

describe("popup backend source metadata", () => {
    test("shows backend name and enables voting only for the vote capability", () => {
        const source = getPopupSegmentSource(segment(SponsorSourceType.Server, "main"), {
            main: {
                backendId: "main",
                name: "Main backend",
                capabilities: [VOTE_ON_SPONSOR_TIME_CAPABILITY],
            },
        });

        expect(source).toEqual({ kind: "backend", name: "Main backend", backendId: "main", canVote: true });
        expect(getPopupVoteBackendId(segment(SponsorSourceType.Server, "main"), {
            main: {
                backendId: "main",
                name: "Main backend",
                capabilities: [VOTE_ON_SPONSOR_TIME_CAPABILITY],
            },
        })).toBe("main");
    });

    test("hides voting for missing backend metadata and non-server sources", () => {
        expect(getPopupSegmentSource(segment(SponsorSourceType.Server, "missing"), {})).toEqual({
            kind: "backend",
            name: "missing",
            backendId: "missing",
            canVote: false,
        });
        expect(getPopupSegmentSource(segment(SponsorSourceType.Local), {})).toEqual({ kind: "local" });
        expect(getPopupSegmentSource(segment(SponsorSourceType.Danmaku), {})).toEqual({ kind: "danmaku" });
        expect(getPopupSegmentSource(segment(SponsorSourceType.YouTube), {})).toEqual({ kind: "youtube" });
        expect(getPopupSegmentSource(segment(undefined), {})).toEqual({ kind: "unknown" });
        expect(getPopupVoteBackendId(segment(SponsorSourceType.Server, "missing"), {})).toBeUndefined();
    });
});
