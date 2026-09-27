import { evaluateRules } from '../../content/skipRules/engine';
import { speedUpTarget } from '../../content/skipRules/playback';
import { rulePreferences } from '../../content/skipRules/preferences';
import { emptyRuleState, Policy, RuleCard, RuleEvent, RulePlan, RuleState } from '../../content/skipRules/types';
import { NoticeClock, secondsUntilSegment } from '../../notices/NoticeClock';

export type Mode = Policy | 'fast';
export type StateName = 'preview' | 'ready' | 'active' | 'custom' | 'cancelled' | 'undo' | 'completed' | 'closed';
export type Layout = 'single' | 'adjacent' | 'overlap';
export interface Settings {
    disabled?: boolean;
    entry: boolean;
    preview: number;
    duration: number;
    rate: number;
    showCards: boolean;
    resumeEntry: 'continue' | 'manual';
    resumeSpeed: 'continue' | 'manual';
}
export interface ExampleSegment { id: string; start: number; end: number; mode: Mode }
export interface Simulation {
    time: number;
    paused: boolean;
    waiting: boolean;
    rate: number;
    baseline: number;
    ownedRate: boolean;
    hovered: boolean;
    speedUp: boolean;
    settings: Settings;
    segments: ExampleSegment[];
    rules: RuleState;
    plan?: RulePlan;
    lifetimes: Record<string, { key: string; remaining: number; expired: boolean }>;
}
export interface CardView extends RuleCard {
    id: string;
    label: string;
    visible: boolean;
    seconds: number;
    held: boolean;
}
export type Action = 'natural' | 'front' | 'back' | 'within' | 'keyboard' | 'pause' | 'resume' | 'buffer' | 'data' |
    'exitNatural' | 'exitSeek' | 'keyboardExit' | 'exitBack' | 'cross' | 'skip' | 'cancel' | 'close' | 'undo' | 'rate' | 'allow';
export interface InputEvent { kind: 'time' | 'seek' | 'pause' | 'resume' | 'buffer' | 'playing' | 'data' | 'skip' | 'cancel' | 'close' | 'undo' | 'allow' | 'rate' | 'wall'; time?: number; rate?: number; seconds?: number; id?: string; fail?: boolean }
export interface Result { state: Simulation; from: number; cards: CardView[]; trace: RulePlan['trace']; effects: NonNullable<RulePlan['seek']>[]; failed: boolean }
export const modes: Mode[] = ['auto', 'manual', 'fast', 'mark', 'ignore'];
export const groups = ['movement', 'playback', 'exit', 'controls'] as const;
export const operations: Array<{ id: Action; group: typeof groups[number] }> = [
    ...(['natural', 'front', 'back', 'within', 'keyboard'] as Action[]).map(id => ({ id, group: 'movement' as const })),
    ...(['pause', 'resume', 'buffer', 'data'] as Action[]).map(id => ({ id, group: 'playback' as const })),
    ...(['exitNatural', 'exitSeek', 'keyboardExit', 'exitBack', 'cross'] as Action[]).map(id => ({ id, group: 'exit' as const })),
    ...(['skip', 'cancel', 'close', 'undo', 'rate', 'allow'] as Action[]).map(id => ({ id, group: 'controls' as const })),
];
export function rows(mode: Mode): StateName[] {
    if (mode === 'fast') return ['preview', 'ready', 'active', 'custom', 'cancelled', 'undo', 'completed', 'closed'];
    if (mode === 'auto') return ['preview', 'ready', 'cancelled', 'undo', 'completed', 'closed'];
    return mode === 'manual' ? ['ready', 'undo', 'completed', 'closed'] : ['ready'];
}
export function available(mode: Mode, state: StateName, action: Action): boolean {
    if (['preview', 'completed'].includes(state) && ['within', 'exitNatural', 'exitSeek', 'keyboardExit', 'exitBack'].includes(action)) return false;
    if (['auto', 'fast'].includes(mode) && state === 'ready' && action === 'exitNatural') return false;
    if (['mark', 'ignore'].includes(mode) && ['skip', 'cancel', 'close', 'undo', 'allow'].includes(action)) return false;
    if (action === 'undo') return state === 'completed';
    if (action === 'allow') return mode === 'fast' && ['custom', 'cancelled'].includes(state);
    if (action === 'cancel') return ['auto', 'fast'].includes(mode) && (state === 'preview' || mode === 'fast' && state === 'active');
    if (action === 'skip' || action === 'close') return state !== 'closed' && (action !== 'skip' || !['preview', 'completed'].includes(state));
    return true;
}

export function makeSimulation(settings: Settings, mode: Mode, state: StateName = 'preview', layout: Layout = 'single', second: Policy = 'manual'): Simulation {
    const time = state === 'preview' ? 8 : state === 'completed' ? 20 : state === 'undo' ? 10 : 15;
    const segments: ExampleSegment[] = [{ id: 'A', start: 10, end: 20, mode }];
    if (layout !== 'single') segments.push({ id: 'B', start: layout === 'overlap' ? 15 : 20, end: layout === 'overlap' ? 25 : 30, mode: second });
    const rules = emptyRuleState();
    for (const s of segments) rules.visits[s.id] = { number: 0, inside: false, entered: false, auto: true, start: s.start, end: s.end };
    Object.assign(rules.visits.A, { number: state === 'preview' ? 0 : 1, inside: time >= 10 && time < 20, entered: state !== 'preview' });
    const visit = rules.visits.A;
    if (state === 'active') visit.phase = 'speeding';
    if (state === 'custom') { visit.excluded = 'user-rate'; visit.phase = 'speed-paused'; }
    if (state === 'cancelled') { visit.excluded = mode === 'fast' ? 'pause-speed' : 'cancel'; visit.phase = mode === 'fast' ? 'speed-paused' : 'pending'; }
    if (state === 'undo') { visit.excluded = 'undo'; visit.phase = 'pending'; }
    if (state === 'completed') { visit.phase = 'completed'; visit.auto = false; }
    if (state === 'closed') visit.excluded = 'dismiss';
    return { time, paused: false, waiting: false, rate: state === 'active' ? speedUpTarget(1, settings.rate) : state === 'custom' ? 2 : 1,
        baseline: state === 'custom' ? 2 : 1, ownedRate: state === 'active', hovered: false, speedUp: mode === 'fast',
        settings: { ...settings }, segments, rules, lifetimes: {} };
}

export function cards(state: Simulation): CardView[] {
    return Object.entries(state.plan?.cards ?? {}).map(([id, card]) => {
        const visit = state.rules.visits[id];
        const label = card.phase === 'speed-paused' ? visit.excluded === 'user-rate' ? 'custom' : 'cancelled' :
            card.phase === 'pending' ? visit.excluded === 'undo' ? 'undo' : visit.excluded === 'cancel' ? 'cancelled' : !visit.auto ? 'waiting' : 'pending' :
                card.phase === 'preview' && !card.automatic ? 'cancelledPreview' : card.phase;
        return { ...card, id, label, visible: card.show && !state.lifetimes[id]?.expired,
            seconds: card.clock.kind === 'display' ? Math.ceil((state.lifetimes[id]?.remaining ?? state.settings.duration * 1000) / 1000) :
                secondsUntilSegment({ currentTime: state.time, playbackRate: state.rate }, card.clock.deadline),
            held: card.phase !== 'preview' && (state.hovered || card.phase === 'speed-paused' || card.clock.kind === 'media' && state.paused) };
    });
}

/** Simulate player I/O and successful feedback; all actual decisions come from evaluateRules. */
export function step(previous: Simulation, event: InputEvent): Result {
    const state: Simulation = JSON.parse(JSON.stringify(previous));
    const from = state.time, effects: Result['effects'] = [], trace: Result['trace'] = [];
    let failed = false;
    if (event.kind === 'pause') state.paused = true;
    if (event.kind === 'resume') state.paused = false;
    if (event.kind === 'buffer') state.waiting = true;
    if (event.kind === 'playing' || event.kind === 'resume') state.waiting = false;
    if (event.time !== undefined && (event.kind === 'time' || event.kind === 'seek')) state.time = event.time;
    const id = event.id ?? 'A';
    let command: RuleEvent;
    switch (event.kind) {
        case 'skip': case 'undo': command = { kind: event.kind, id }; break;
        case 'close': command = { kind: 'dismiss', id }; break;
        case 'cancel': command = { kind: state.rules.visits[id]?.phase === 'speeding' ? 'pause-speed' : 'deny', id }; break;
        case 'allow': command = { kind: ['pause-speed', 'user-rate'].includes(state.rules.visits[id]?.excluded) ? 'resume-speed' : 'allow', id }; break;
        case 'rate': {
            const ids = Object.entries(state.rules.visits).filter(([, v]) => v.phase === 'speeding').map(([key]) => key);
            state.rate = event.rate; state.baseline = state.rate; state.ownedRate = false;
            command = { kind: 'user-rate', ids }; break;
        }
        case 'buffer': command = { kind: 'pause' }; break;
        case 'playing': command = { kind: 'resume' }; break;
        case 'wall': command = { kind: 'time' }; break;
        default: command = { kind: event.kind };
    }
    for (let pass = 0; pass <= state.segments.length + 1; pass++) {
        const settings = state.settings;
        const plan = evaluateRules(state.rules, { time: state.time, paused: state.paused, waiting: state.waiting, disabled: settings.disabled === true, editing: false,
            ...rulePreferences({ enableSpeedUp: state.speedUp, skipOnSeekToSegment: settings.entry,
                advanceSkipNotice: settings.preview > 0, skipNoticeDurationBefore: settings.preview,
                dontShowNotice: !settings.showCards, previewIncludeOtherSegments: false,
                skipResumeAction: settings.resumeEntry, speedUpResumeAction: settings.resumeSpeed }),
            segments: state.segments.map(s => ({ id: s.id, start: s.start, end: s.end, action: 'skip', policy: s.mode === 'fast' ? 'auto' : s.mode })) }, command);
        state.rules = plan.state; state.plan = plan; trace.push(...plan.trace);
        if (!state.paused && !state.waiting) {
            if (plan.speed.length) {
                if (!state.ownedRate) state.baseline = state.rate;
                state.ownedRate = true; state.rate = speedUpTarget(state.baseline, settings.rate);
            } else if (state.ownedRate) { state.rate = state.baseline; state.ownedRate = false; }
        }
        if (!plan.seek) break;
        if (event.fail) { failed = true; break; }
        state.time = plan.seek.time; effects.push(plan.seek);
        command = plan.seek.reason === 'skip' ? { kind: 'applied', ids: plan.seek.ids } : { kind: 'handoff' };
    }
    for (const [key, card] of Object.entries(state.plan.cards)) {
        const signature = JSON.stringify(card);
        if (state.lifetimes[key]?.key !== signature) state.lifetimes[key] = { key: signature, remaining: state.settings.duration * 1000, expired: false };
        const lifetime = state.lifetimes[key];
        if (event.kind === 'wall' && card.clock.kind === 'display' && card.show && !lifetime.expired) {
            let now = 0;
            const clock = new NoticeClock(lifetime.remaining, () => now);
            clock.setPaused(state.hovered); now = (event.seconds ?? 0) * 1000;
            lifetime.remaining = clock.read(); lifetime.expired = lifetime.remaining <= 0;
        }
    }
    for (const key of Object.keys(state.lifetimes)) if (!state.plan.cards[key]) delete state.lifetimes[key];
    return { state, from, effects, trace, failed, cards: cards(state) };
}

export function scenario(settings: Settings, mode: Mode, state: StateName, action: Action): Result {
    let s = makeSimulation(settings, mode, state);
    if (['front', 'back', 'keyboard', 'cross'].includes(action)) s = step(s, { kind: 'seek', time: action === 'back' ? 35 : 0 }).state;
    if (action === 'resume') s = step(s, { kind: 'pause' }).state;
    const events: Record<Action, InputEvent> = {
        natural: { kind: 'time', time: s.time < 10 ? 10 : s.time + 1 }, front: { kind: 'seek', time: 12 }, back: { kind: 'seek', time: 15 },
        within: { kind: 'seek', time: 17 }, keyboard: { kind: 'seek', time: 12 }, pause: { kind: 'pause' }, resume: { kind: 'resume' },
        buffer: { kind: 'buffer' }, data: { kind: 'data' }, exitNatural: { kind: 'time', time: 20 }, exitSeek: { kind: 'seek', time: 23 },
        keyboardExit: { kind: 'seek', time: 23 }, exitBack: { kind: 'seek', time: 5 }, cross: { kind: 'seek', time: 35 },
        skip: { kind: 'skip' }, cancel: { kind: 'cancel' }, close: { kind: 'close' }, undo: { kind: 'undo' }, rate: { kind: 'rate', rate: 2 }, allow: { kind: 'allow' },
    };
    return step(s, events[action]);
}

/** Visit every crossed boundary even at high playback rates. */
export function advance(previous: Simulation, seconds: number, fail = false): Result {
    let state = previous, remaining = seconds;
    const trace: Result['trace'] = [], effects: Result['effects'] = [];
    let failed = false;
    for (let i = 0; i < 12 && remaining > 0 && !state.paused && !state.waiting; i++) {
        const next = Math.min(40, ...state.segments.flatMap(s => [s.start, s.end]).filter(time => time > state.time + 0.00001));
        const elapsed = Math.min(remaining, Math.max(0, (next - state.time) / state.rate));
        if (!elapsed) break;
        const result = step(state, { kind: 'time', time: Math.min(40, state.time + elapsed * state.rate), fail });
        state = result.state; remaining -= elapsed; trace.push(...result.trace); effects.push(...result.effects); failed ||= result.failed;
    }
    const result = step(state, { kind: 'wall', seconds, fail });
    return { ...result, from: previous.time, trace: [...trace, ...result.trace], effects, failed: failed || result.failed };
}
