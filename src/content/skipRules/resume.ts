import { eligibility, RULES } from './rules';
import { RuleEvent, RuleInput, RulePlan } from './types';

/** Remember an actual video pause; a buffering/playing pair alone is not a resume preference. */
export function applyResumePreferences(plan: RulePlan, input: RuleInput, event: RuleEvent): void {
    for (const segment of input.segments) {
        const visit = plan.state.visits[segment.id];
        if (!visit.inside || segment.action !== 'skip' || segment.draft || input.previewId === segment.id || visit.phase === 'completed') {
            visit.resumeFrom = undefined;
            continue;
        }
        // Explicit card actions while paused take precedence over the resume preference.
        if ('id' in event && event.id === segment.id && ['skip', 'allow', 'resume-speed'].includes(event.kind)) {
            visit.resumeFrom = input.paused || input.waiting ? 'explicit' : undefined;
            continue;
        }
        if (!eligibility(segment, visit, input, plan.protectedBy[segment.id]).automatic) {
            visit.resumeFrom = undefined;
            continue;
        }
        if (input.paused) {
            visit.resumeFrom ??= visit.phase === 'speeding' ? 'speed' : 'pending';
            continue;
        }
        if (input.waiting || !visit.resumeFrom) continue;
        const from = visit.resumeFrom;
        visit.resumeFrom = undefined;
        if (from === 'explicit') continue;
        const manual = (from === 'speed' ? input.speedUpResumeAction : input.resumeAction) === 'manual';
        if (manual) {
            visit.auto = false;
            // Use the existing paused-speed controls to allow an explicit restart.
            if (from === 'speed') { visit.excluded = 'pause-speed'; visit.phase = 'speed-paused'; }
            else visit.phase = 'pending';
        }
        plan.trace.push({ id: segment.id, rule: from === 'speed' ? RULES.resumeSpeed : RULES.resumeEntry,
            result: manual ? 'manual-for-this-visit' : 'follow-segment-policy' });
    }
}
