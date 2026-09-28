import { eligibility, RULES } from './rules';
import { mergeSeek } from './planner';
import { canAutomaticallyPlay, playbackMethod } from './playback';
import { updateVisits } from './visits';
import { applyUserIntent } from './intents';
import { applyResumePreferences } from './resume';
import { projectSegment } from './cards';
import { prepareSegmentPolicies } from './policy';
import { resolveOverlap } from './overlap';
import { contains, RuleEvent, RuleInput, RulePlan, RuleState } from './types';

/** Compose independent visit, intent, eligibility, playback and presentation rules. */
export function evaluateRules(previous: RuleState, input: RuleInput, event: RuleEvent): RulePlan {
    input = prepareSegmentPolicies(input);
    const visits = Object.fromEntries(Object.entries(previous.visits).map(([id, visit]) => [id, { ...visit }]));
    const plan: RulePlan = { state: { time: input.time, visits, reviews: { ...previous.reviews } }, cards: {}, speed: [], mute: [], protectedBy: {},
        trace: input.segments.flatMap(segment => segment.policyTrace ?? []) };
    updateVisits(plan, input, event);
    applyUserIntent(plan, input, event);
    resolveOverlap(plan, input, event);
    applyResumePreferences(plan, input, event);
    for (const segment of input.segments) {
        const decision = eligibility(segment, visits[segment.id], input, plan.protectedBy[segment.id]);
        plan.trace.push({ id: segment.id, rule: decision.rule, result: decision.automatic ? 'automatic' : decision.show ? 'manual' : 'excluded' });
        projectSegment(plan, segment, input, event, decision);
    }
    // Point navigation is deliberately separate from interval merging.
    const highlights = input.segments.filter(s => s.action === 'poi' && s.end > input.time &&
        Number.isFinite(s.end) && !visits[s.id].excluded && !input.disabled &&
        (!input.editing || input.includeOtherSegments)).sort((a, b) => b.start - a.start);
    plan.poi = highlights.find(s => s.policy === 'manual')?.id;
    const automaticPoint = highlights.find(s => s.policy === 'auto');
    if (!plan.seek && automaticPoint && canAutomaticallyPlay(input)) {
        plan.seek = { time: automaticPoint.end, ids: [automaticPoint.id], reason: 'skip' };
        plan.trace.push({ id: automaticPoint.id, rule: RULES.point, result: 'navigate-to-point' });
    }
    if (!plan.seek && canAutomaticallyPlay(input) && !input.disabled) {
        const candidates = input.segments.filter(s => s.action === 'skip' && s.end > input.time &&
            eligibility(s, visits[s.id], input, plan.protectedBy[s.id]).automatic && visits[s.id].phase !== 'completed' && playbackMethod(s, input) === 'seek');
        const start = candidates.find(s => contains(s, input.time));
        if (start) {
            const members = mergeSeek(start, candidates);
            plan.seek = { time: Math.max(...members.map(s => s.end)), ids: members.map(s => s.id), reason: 'skip' };
            plan.trace.push({ id: start.id, rule: RULES.merged, result: members.map(s => s.id).join(',') });
        }
    }
    return plan;
}
