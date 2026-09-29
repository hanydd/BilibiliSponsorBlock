import { Eligibility, RULES } from './rules';
import { RuleEvent, RuleInput, RulePlan, RuleSegment } from './types';

/** The method is independent of whether this visit currently permits automatic execution. */
export function playbackMethod(segment: RuleSegment, input: Pick<RuleInput, 'speedUp'>): 'seek' | 'speed' | 'mute' {
    if (segment.action === 'mute') return 'mute';
    return input.speedUp && segment.end - segment.start >= 0.5 && !segment.draft ? 'speed' : 'seek';
}

export function canAutomaticallyPlay(input: Pick<RuleInput, 'paused' | 'waiting'>): boolean {
    return !input.paused && !input.waiting;
}

/** Preserve the extension's rate calculation, including the equal-baseline case. */
export function speedUpTarget(original: number, configuredRate: number): number {
    const configured = Math.min(16, Math.max(1.1, Number(configuredRate) || 2));
    return Math.min(16, Math.abs(configured - original) <= 0.05 ? original + configured : Math.max(configured, original));
}

/** Decide visit phases and active effects before projecting any cards. */
export function planSegmentPlayback(plan: RulePlan, segment: RuleSegment, input: RuleInput, event: RuleEvent, decision: Eligibility): void {
    const visit = plan.state.visits[segment.id];
    const id = segment.id;
    visit.automatic = decision.automatic;
    if (!decision.available) { visit.phase = undefined; return; }
    const canRun = canAutomaticallyPlay(input);
    if (visit.inside && visit.phase !== 'completed') {
        if (!canRun && decision.automatic) plan.trace.push({ id, rule: RULES.paused, result: 'wait-for-playback' });
        if (decision.automatic && canRun) {
            const method = playbackMethod(segment, input);
            visit.phase = method === 'mute' ? 'muted' : method === 'speed' ? 'speeding' : 'pending';
            plan.trace.push({ id, rule: RULES[method], result: method });
        } else if (!canRun && decision.automatic && (visit.phase === 'speeding' || visit.phase === 'muted')) {
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
}

export interface PlaybackState {
    rate: number;
    muted: boolean;
    speed?: { original: number; target: number };
    mute?: { original: boolean };
}

/** Shared by the video adapter and simulator. Only restore values still owned by us. */
export function transitionPlayback(current: PlaybackState, plan: Pick<RulePlan, 'state' | 'speed' | 'mute'>,
    input: Pick<RuleInput, 'paused' | 'waiting'>, configuredRate: number): PlaybackState {
    const next = { ...current };
    const running = canAutomaticallyPlay(input);
    const phases = Object.values(plan.state.visits).map(visit => visit.phase);
    if (running && plan.speed.length) {
        const original = current.speed?.original ?? current.rate;
        next.speed = { original, target: speedUpTarget(original, configuredRate) };
        next.rate = next.speed.target;
    } else if (running || !phases.includes('speeding')) {
        if (current.speed && current.rate === current.speed.target) next.rate = current.speed.original;
        next.speed = undefined;
    }
    if (running && plan.mute.length) {
        next.mute = current.mute ?? { original: current.muted };
        next.muted = true;
    } else if (running || !phases.includes('muted')) {
        if (current.mute && current.muted) next.muted = current.mute.original;
        next.mute = undefined;
    }
    return next;
}
