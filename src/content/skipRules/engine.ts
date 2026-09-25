import { eligibility, RULES } from './rules';
import { mergeSeek } from './planner';
import { contains, RuleEvent, RuleInput, RulePlan, RuleState, Visit } from './types';

/** One pure transition per observation or explicit user intent. */
export function evaluateRules(previous: RuleState, input: RuleInput, event: RuleEvent): RulePlan {
    const visits: Record<string, Visit> = Object.fromEntries(Object.entries(previous.visits).map(([id, v]) => [id, { ...v }]));
    const plan: RulePlan = { state: { time: input.time, visits }, cards: {}, speed: [], mute: [], trace: [] };
    // Missing data must not freeze a visit forever. Refresh can temporarily omit a segment.
    const known = new Set(input.segments.map(segment => segment.id));
    for (const [id, visit] of Object.entries(visits)) {
        if (!known.has(id) && !contains(visit, input.time)) {
            visit.inside = false;
            visit.entered = false;
            visit.excluded = undefined;
            visit.phase = undefined;
        }
    }
    const applied = event.kind === 'applied' ? new Set(event.ids) : new Set<string>();
    for (const segment of input.segments) {
        const old = previous.visits[segment.id];
        const inside = contains(segment, input.time);
        let visit = visits[segment.id];
        if (!visit) visit = visits[segment.id] = { number: 0, inside: false, entered: false, auto: true, start: segment.start, end: segment.end };
        if (inside && !visit.inside && !applied.has(segment.id)) {
            // Preview cancellation belongs to the upcoming visit, not to an outside sample.
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
            visit.entered = false;
            visit.auto = true;
        }
        if (!inside && !visit.entered && input.time >= segment.end) visit.excluded = undefined;
        if (event.kind === "edit-end" && inside) visit.auto = false;
        visit.inside = inside;
        visit.start = segment.start;
        visit.end = segment.end;
        if (applied.has(segment.id)) {
            if (!visit.number) visit.number = 1;
            visit.phase = 'completed';
            visit.auto = false;
        }
        if ('id' in event && event.id === segment.id) {
            plan.trace.push({ id: segment.id, rule: RULES.explicit, result: event.kind });
            if (event.kind === 'dismiss') { visit.excluded = 'dismiss'; visit.phase = undefined; }
            if (event.kind === 'undo' || event.kind === 'deny') { visit.excluded = 'undo'; visit.manual = undefined; visit.phase = 'pending'; }
            if (event.kind === 'pause-speed') { visit.excluded = 'pause-speed'; visit.phase = 'speed-paused'; }
            if (event.kind === 'resume-speed' || event.kind === 'allow') { visit.excluded = undefined; visit.auto = true; visit.phase = undefined; if (event.kind === 'resume-speed') visit.manual = 'speed'; }
            if (event.kind === 'undo' && (segment.action !== 'mute' || event.forceSeek)) plan.seek = { time: segment.start, ids: [segment.id], reason: 'undo' };
            if (event.kind === 'skip') {
                if (segment.action === 'mute' && !event.forceSeek) { visit.excluded = undefined; visit.auto = true; visit.manual = 'mute'; visit.phase = 'muted'; }
                else plan.seek = { time: segment.end, ids: [segment.id], reason: 'skip' };
            }
        }
        const decision = eligibility(segment, visit, input);
        plan.trace.push({ id: segment.id, rule: decision.rule, result: decision.automatic ? 'automatic' : decision.show ? 'manual' : 'excluded' });
        if (!decision.show) { visit.phase = undefined; continue; }
        if (inside && visit.phase !== 'completed') {
            const canRun = !input.paused && !input.waiting;
            if (decision.automatic && canRun) {
                if (segment.action === 'mute') visit.phase = 'muted';
                else if (input.speedUp && segment.end - segment.start >= 0.5 && !segment.draft) visit.phase = 'speeding';
                else visit.phase = 'pending';
            } else if (!canRun && (visit.phase === 'speeding' || visit.phase === 'muted')) {
                plan.trace.push({ id: segment.id, rule: RULES.paused, result: 'preserve-presentation' });
            } else if (visit.excluded === 'pause-speed') visit.phase = 'speed-paused';
            else if (visit.phase !== 'muted' || event.kind !== 'skip') visit.phase = 'pending';
            if (canRun && visit.phase === 'speeding') plan.speed.push(segment.id);
            if (canRun && visit.phase === 'muted') plan.mute.push(segment.id);
        } else if (!inside && input.time < segment.start) {
            // Completed cards are replaced when a new preview is actually due.
            visit.phase = input.previewLead > 0 && segment.start - input.time <= input.previewLead && segment.policy === 'auto'
                ? 'preview' : undefined;
        }
        if (visit.phase) {
            plan.cards[segment.id] = { visit: visit.number, phase: visit.phase, automatic: decision.automatic,
                deadline: visit.phase === 'completed' ? undefined : visit.phase === 'preview' ? segment.start : segment.end };
        }
        // Keep exclusions through refresh while still inside the same range.
        if (old?.excluded === 'dismiss' && event.kind === 'data' && inside && old.inside) visit.excluded = 'dismiss';
    }
    // Undo is an explicit request to watch the target. Overlapping automatic
    // segments must not immediately move it away again on the return seek.
    if (event.kind === 'undo') {
        const target = input.segments.find(segment => segment.id === event.id);
        if (target) {
            const action = target.action === 'mute' && !event.forceSeek ? 'mute' : 'skip';
            for (const segment of input.segments) {
                if (segment.id !== target.id && segment.policy === 'auto' && segment.action === action &&
                    segment.start < target.end && segment.end > target.start && !visits[segment.id].excluded) {
                    visits[segment.id].excluded = 'undo';
                    plan.trace.push({ id: segment.id, rule: RULES.explicit, result: 'undo-overlap-protection' });
                }
            }
        }
    }
    // Highlights navigate to a point; they never participate in interval merging.
    const highlights = input.segments.filter(s => s.action === 'poi' && s.end > input.time &&
        Number.isFinite(s.end) && !visits[s.id].excluded && !input.disabled &&
        (!input.editing || input.includeOtherSegments)).sort((a, b) => b.start - a.start);
    plan.poi = highlights.find(s => s.policy === 'manual')?.id;
    const automaticPoint = highlights.find(s => s.policy === 'auto');
    if (!plan.seek && automaticPoint && !input.paused && !input.waiting) {
        plan.seek = { time: automaticPoint.end, ids: [automaticPoint.id], reason: 'skip' };
    }
    if (!plan.seek && !input.paused && !input.waiting && !input.disabled) {
        const candidates = input.segments.filter(s => s.action === 'skip' &&
            eligibility(s, visits[s.id], input).automatic && visits[s.id].phase !== 'completed' &&
            (!input.speedUp || s.end - s.start < 0.5 || s.draft));
        const start = candidates.find(s => contains(s, input.time));
        if (start) {
            const members = mergeSeek(start, candidates);
            plan.seek = { time: Math.max(...members.map(s => s.end)), ids: members.map(s => s.id), reason: 'skip' };
            plan.trace.push({ id: start.id, rule: RULES.merged, result: members.map(s => s.id).join(',') });
        }
    }
    return plan;
}
