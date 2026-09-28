import { RULES } from './rules';
import { contains, RuleEvent, RuleInput, RulePlan } from './types';

/** Position changes define visits; playback method and card appearance do not. */
export function updateVisits(plan: RulePlan, input: RuleInput, event: RuleEvent): void {
    const visits = plan.state.visits;
    const known = new Set(input.segments.map(segment => segment.id));
    for (const [id, visit] of Object.entries(visits)) {
        if (!known.has(id) && !contains(visit, input.time)) {
            visit.inside = false;
            visit.entered = false;
            visit.excluded = undefined;
            visit.overlapOverride = undefined;
            visit.phase = undefined;
        }
    }
    const applied = event.kind === 'applied' ? new Set(event.ids) : new Set<string>();
    for (const segment of input.segments) {
        const inside = contains(segment, input.time);
        let visit = visits[segment.id];
        if (!visit) visit = visits[segment.id] = { number: 0, inside: false, entered: false, auto: true, start: segment.start, end: segment.end };
        if (inside && !visit.inside && !applied.has(segment.id)) {
            const upcoming = !visit.entered && visit.excluded;
            const allow = event.kind !== 'seek' || input.skipOnEntry;
            visit = visits[segment.id] = { number: visit.number + 1, inside: true, entered: true, auto: allow,
                excluded: upcoming || undefined, start: segment.start, end: segment.end };
            plan.trace.push({ id: segment.id, rule: RULES.enter, result: allow ? 'evaluate-policy' : 'manual-entry' });
        } else if (inside && event.kind === 'seek') {
            plan.trace.push({ id: segment.id, rule: RULES.within, result: 'preserve-visit' });
        }
        if (!inside && visit.inside) {
            const naturalEnd = event.kind !== 'seek' && input.time >= segment.end;
            visit.phase = naturalEnd && (visit.phase === 'speeding' || visit.phase === 'muted') ? 'completed' :
                visit.phase === 'completed' ? 'completed' : undefined;
            visit.excluded = undefined;
            visit.manual = undefined;
            visit.overlapOverride = undefined;
            visit.entered = false;
            visit.auto = true;
            plan.trace.push({ id: segment.id, rule: RULES.leave, result: visit.phase === 'completed' ? 'completed' : 'left-without-completion' });
        }
        if (!inside && !visit.entered && input.time >= segment.end) visit.excluded = undefined;
        if (event.kind === 'edit-end' && inside) visit.auto = false;
        visit.inside = inside;
        visit.start = segment.start;
        visit.end = segment.end;
        if (applied.has(segment.id)) {
            if (!visit.number) visit.number = 1;
            visit.phase = 'completed';
            visit.auto = false;
            plan.trace.push({ id: segment.id, rule: RULES.applied, result: 'completed' });
        }
    }
}
