import { BackendSegmentResult, BackendSponsorTime } from "./types";
import { SponsorTime } from "../types";

interface Candidate {
    segment: SponsorTime;
    backendId: string;
    priority: number;
    order: number;
}

function overlaps(first: SponsorTime, second: SponsorTime): boolean {
    if (String(first.cid) !== String(second.cid)) return false;
    const firstStart = first.segment[0];
    const firstEnd = first.segment[1] ?? firstStart;
    const secondStart = second.segment[0];
    const secondEnd = second.segment[1] ?? secondStart;
    return firstStart <= secondEnd && secondStart <= firstEnd;
}

/**
 * Merge results in backend priority order. Lower priority numbers win; when
 * omitted, the input result order is used. The returned backendId is internal
 * provenance and must be removed before sending a segment to an API.
 */
export function mergeBackendSegments(results: readonly BackendSegmentResult[]): BackendSponsorTime[] {
    const candidates: Candidate[] = [];
    results.forEach((result, resultIndex) => {
        const priority = result.priority ?? resultIndex;
        result.segments.forEach((segment, segmentIndex) => {
            candidates.push({ segment, backendId: result.backendId, priority, order: segmentIndex });
        });
    });
    candidates.sort((first, second) => first.priority - second.priority);

    const merged: Array<BackendSponsorTime & { _priority: number; _order: number }> = [];
    const uuids = new Set<string>();
    for (const candidate of candidates) {
        const uuid = String(candidate.segment.UUID);
        if (uuids.has(uuid)) continue;
        if (
            merged.some(
                (existing) =>
                    existing._priority < candidate.priority && overlaps(existing, candidate.segment)
            )
        ) {
            continue;
        }
        const mergedSegment = {
            ...candidate.segment,
            backendId: candidate.backendId,
            _priority: candidate.priority,
            _order: candidate.order,
        } as BackendSponsorTime & { _priority: number; _order: number };
        merged.push(mergedSegment);
        uuids.add(uuid);
    }

    return merged
        .sort((first, second) => first.segment[0] - second.segment[0] || first._priority - second._priority || first._order - second._order)
        .map((segment) => {
            const publicSegment = { ...segment } as unknown as Record<string, unknown>;
            delete publicSegment._priority;
            delete publicSegment._order;
            return publicSegment as unknown as BackendSponsorTime;
        });
}
