import { SponsorHideType, SponsorTime } from '../types';
import { belowMinimumDuration } from './skipRules/policy';

/** UI compatibility projection. The engine evaluates duration itself from the original bounds. */
export function refreshMinimumDuration(segments: SponsorTime[], minimum: number): void {
    for (const segment of segments) {
        if (segment.hidden === SponsorHideType.MinimumDuration) delete segment.hidden;
        if (segment.hidden === undefined && belowMinimumDuration(segment.segment[1] - segment.segment[0], minimum)) {
            segment.hidden = SponsorHideType.MinimumDuration;
        }
    }
}
