import { RuleSegment } from './types';

/** Only authorised members extend a seek. Never bridge gaps of normal content. */
export function mergeSeek(start: RuleSegment, candidates: readonly RuleSegment[]): RuleSegment[] {
    const members = new Map([[start.id, start]]);
    let end = start.end;
    let changed = true;
    while (changed) {
        changed = false;
        for (const segment of candidates) {
            if (!members.has(segment.id) && segment.start <= end && segment.end > start.start) {
                members.set(segment.id, segment);
                if (segment.end > end) { end = segment.end; changed = true; }
            }
        }
    }
    return [...members.values()].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}
