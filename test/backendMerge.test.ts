import { ActionType, Category, SponsorSourceType, SponsorTime } from "../src/types";
import { BackendSegmentResult, mergeBackendSegments } from "../src/backends";

function segment(UUID: string, cid: string, range: [number] | [number, number]): SponsorTime {
    return {
        UUID: UUID as SponsorTime["UUID"],
        cid: cid as SponsorTime["cid"],
        segment: range,
        category: "sponsor" as Category,
        actionType: ActionType.Skip,
        source: SponsorSourceType.Server,
    };
}

describe("backend segment merge", () => {
    test("deduplicates UUIDs and keeps higher-priority overlapping segments", () => {
        const results: BackendSegmentResult[] = [
            {
                backendId: "first",
                segments: [segment("same", "1", [10, 20]), segment("first-only", "1", [30, 40])],
            },
            {
                backendId: "second",
                segments: [
                    segment("same", "1", [10, 20]),
                    segment("overlap", "1", [15, 25]),
                    segment("other-cid", "2", [15, 25]),
                    segment("separate", "1", [50, 60]),
                ],
            },
        ];
        const merged = mergeBackendSegments(results);
        expect(merged.map((item) => item.UUID)).toEqual(["same", "other-cid", "first-only", "separate"]);
        expect(merged.every((item) => item.backendId === "first" || item.backendId === "second")).toBe(true);
        expect(merged.find((item) => item.UUID === "same")?.backendId).toBe("first");
        expect(merged.find((item) => item.UUID === "other-cid")?.backendId).toBe("second");
    });

    test("honors explicit priority even when result order differs", () => {
        const merged = mergeBackendSegments([
            { backendId: "low", priority: 10, segments: [segment("low", "1", [0, 10])] },
            { backendId: "high", priority: 1, segments: [segment("high", "1", [5, 15])] },
        ]);
        expect(merged.map((item) => item.UUID)).toEqual(["high"]);
    });
});
