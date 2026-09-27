import { canAutomaticallyPlay, playbackMethod } from './playback';
import { Eligibility, RULES } from './rules';
import { RuleEvent, RuleInput, RulePlan, RuleSegment } from './types';

/** Card phase follows eligibility and execution; display visibility cannot cancel execution. */
export function projectSegment(plan: RulePlan, segment: RuleSegment, input: RuleInput, event: RuleEvent, decision: Eligibility): void {
    const visit = plan.state.visits[segment.id];
    const id = segment.id;
    if (!decision.show) { visit.phase = undefined; return; }
    const canRun = canAutomaticallyPlay(input);
    if (visit.inside && visit.phase !== 'completed') {
        if (!canRun && decision.automatic) plan.trace.push({ id, rule: RULES.paused, result: 'wait-for-playback' });
        if (decision.automatic && canRun) {
            const method = playbackMethod(segment, input);
            visit.phase = method === 'mute' ? 'muted' : method === 'speed' ? 'speeding' : 'pending';
            plan.trace.push({ id, rule: RULES[method], result: method });
        } else if (!canRun && (visit.phase === 'speeding' || visit.phase === 'muted')) {
            // Pausing the player retains presentation; it does not cancel this visit.
        } else if (visit.excluded === 'pause-speed' || visit.excluded === 'user-rate') visit.phase = 'speed-paused';
        else if (visit.phase !== 'muted' || event.kind !== 'skip') visit.phase = 'pending';
        if (canRun && visit.phase === 'speeding') plan.speed.push(id);
        if (canRun && visit.phase === 'muted') plan.mute.push(id);
    } else if (!visit.inside && input.time < segment.start) {
        visit.phase = input.previewLead > 0 && segment.start - input.time <= input.previewLead && segment.policy === 'auto'
            ? 'preview' : undefined;
        if (visit.phase === 'preview') plan.trace.push({ id, rule: RULES.preview, result: 'before-start' });
    }
    if (!visit.phase) return;
    const deadline = visit.phase === 'completed' ? undefined : visit.phase === 'preview' ? segment.start : segment.end;
    plan.cards[id] = {
        visit: visit.number, phase: visit.phase, automatic: decision.automatic, deadline,
        show: input.showNotices !== false,
        clock: deadline === undefined ? { kind: 'display' } : { kind: 'media', deadline, boundary: visit.phase === 'preview' ? 'start' : 'end' },
    };
    plan.trace.push({ id, rule: input.showNotices === false ? RULES.hidden : deadline === undefined ? RULES.display : RULES.media,
        result: input.showNotices === false ? 'display-only-hidden' : deadline === undefined ? 'configured-display-duration' : visit.phase === 'preview' ? 'until-start' : 'until-end' });
}
