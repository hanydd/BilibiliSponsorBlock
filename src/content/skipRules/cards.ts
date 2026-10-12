import { RULES } from './rules';
import { RuleInput, RulePlan, RuleSegment } from './types';

/** Presentation is derived from the execution plan; it never changes playback state. */
export function projectSegment(plan: RulePlan, segment: RuleSegment, input: RuleInput): void {
    const visit = plan.state.visits[segment.id];
    const id = segment.id;
    if (!visit.phase) return;
    const deadline = visit.phase === 'completed' ? undefined : visit.phase === 'preview' ? segment.start : segment.end;
    plan.cards[id] = {
        visit: visit.number, phase: visit.phase, automatic: visit.automatic, deadline,
        show: input.showNotices !== false,
        clock: deadline === undefined ? { kind: 'display' } : { kind: 'media', deadline, boundary: visit.phase === 'preview' ? 'start' : 'end' },
    };
    plan.trace.push({ id, rule: input.showNotices === false ? RULES.hidden : deadline === undefined ? RULES.display : RULES.media,
        result: input.showNotices === false ? 'display-only-hidden' : deadline === undefined ? 'configured-display-duration' : visit.phase === 'preview' ? 'until-start' : 'until-end' });
}
