import { RULES } from './rules';
import { contains, RuleEvent, RuleInput, RulePlan, RuleSegment } from './types';

export function overlaps(a: RuleSegment, b: RuleSegment): boolean {
    return a.start < b.end && b.start < a.end;
}

/** Resolve cross-segment constraints after visits and explicit intent, before any effect is projected. */
export function resolveOverlap(plan: RulePlan, input: RuleInput, event: RuleEvent): void {
    const reviews = plan.state.reviews;
    const segments = new Map(input.segments.map(segment => [segment.id, segment]));
    for (const id of Object.keys(reviews)) {
        const source = segments.get(id);
        if (!source || !contains(source, input.time)) delete reviews[id];
    }
    if ('id' in event && segments.has(event.id)) {
        const source = segments.get(event.id);
        const visit = plan.state.visits[event.id];
        if (event.kind === 'undo') {
            // It also constrains the current frame, before the return seek is acknowledged.
            reviews[event.id] = { action: source.action === 'mute' && !event.forceSeek ? 'mute' : 'skip' };
            visit.overlapOverride = undefined;
            // A new review is a newer explicit intent than an earlier peer restart.
            for (const target of input.segments) {
                if (target.action === reviews[event.id].action && overlaps(source, target)) {
                    plan.state.visits[target.id].overlapOverride = undefined;
                }
            }
        } else if (['skip', 'allow', 'resume-speed'].includes(event.kind)) {
            delete reviews[event.id];
            visit.overlapOverride = true;
        }
    }
    for (const target of input.segments) {
        const visit = plan.state.visits[target.id];
        if (target.policy !== 'auto' || visit.overlapOverride || input.previewId === target.id) continue;
        const sources = Object.keys(reviews).filter(id => id !== target.id &&
            reviews[id].action === target.action && overlaps(segments.get(id), target)).sort();
        if (!sources.length) continue;
        plan.protectedBy[target.id] = sources;
        plan.trace.push({ id: target.id, rule: RULES.overlap, result: 'protect-return-position', relatedIds: sources });
    }
}
