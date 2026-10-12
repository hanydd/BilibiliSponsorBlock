import { evaluateRules } from '../src/content/skipRules/engine';
import { emptyRuleState, Policy, RuleEvent, RuleInput, RuleSegment, RuleState } from '../src/content/skipRules/types';

const segment = (id: string, start: number, end: number, policy: Policy = 'auto'): RuleSegment => ({ id, start, end, policy, action: 'skip' });
const A = segment('A', 10, 20), B = segment('B', 15, 30);
const defaults: RuleInput = { time: 0, paused: false, waiting: false, disabled: false, speedUp: true,
    skipOnEntry: true, previewLead: 0, editing: false, includeOtherSegments: false, segments: [A, B] };
function sequence(overrides: Partial<RuleInput> = {}) {
    let state: RuleState = emptyRuleState();
    return (time: number, event: RuleEvent = { kind: 'time' }, change: Partial<RuleInput> = {}) => {
        const previous = JSON.stringify(state);
        const plan = evaluateRules(state, { ...defaults, ...overrides, ...change, time }, event);
        expect(JSON.stringify(state)).toBe(previous);
        state = plan.state;
        return plan;
    };
}
function review(overrides: Partial<RuleInput> = {}) {
    const step = sequence(overrides);
    step(12); step(16); step(22);
    const undo = step(22, { kind: 'undo', id: 'A' });
    expect(undo.seek).toEqual({ time: 10, ids: ['A'], reason: 'undo' });
    step(10, { kind: 'handoff' });
    return step;
}

describe('review constraints compose with each segment own visit', () => {
    test.each([false, true])('undo at 22s survives returning outside B; paused=%s', paused => {
        const step = review({ paused });
        const inside = step(16, { kind: 'seek' });
        expect(inside.speed).toEqual([]);
        expect(inside.protectedBy).toEqual({ B: ['A'] });
        expect(inside.state.visits.B.excluded).toBeUndefined();
        expect(inside.cards.B.phase).toBe('pending');
        expect(inside.cards.B.automatic).toBe(false);
        expect(step(16, { kind: 'resume' }, { paused: false }).speed).toEqual([]);
        const end = step(20, { kind: 'time' }, { paused: false });
        expect(end.speed).toEqual(['B']);
        expect(end.protectedBy).toEqual({});
        expect(end.state.reviews).toEqual({});
    });

    test('an already active overlapping speed is released even when undo is clicked while paused', () => {
        const step = sequence(); step(12); step(16); step(22);
        expect(step(22, { kind: 'pause' }, { paused: true }).cards.B.phase).toBe('speeding');
        const undo = step(22, { kind: 'undo', id: 'A' }, { paused: true });
        expect(undo.cards.B.phase).toBe('pending');
        expect(undo.speed).toEqual([]);
    });

    test('instant skip resumes at the source end, without merging protected candidates earlier', () => {
        const step = review({ speedUp: false });
        expect(step(16).seek).toBeUndefined();
        expect(step(20).seek).toEqual({ time: 30, ids: ['B'], reason: 'skip' });
    });

    test.each(['dismiss', 'deny', 'pause-speed'] as const)('B own %s survives the end of A review', kind => {
        const step = review(); step(16, { kind, id: 'B' });
        const end = step(20);
        expect(end.speed).toEqual([]);
        expect(end.state.visits.B.excluded).toBe(kind === 'deny' ? 'cancel' : kind);
    });

    test('closing A card does not interrupt the review, and leaving A releases B', () => {
        const step = review(); step(16, { kind: 'dismiss', id: 'A' });
        expect(step(18).speed).toEqual([]);
        expect(step(22, { kind: 'seek' }).speed).toEqual(['B']);
        expect(step(16, { kind: 'seek' }).speed.sort()).toEqual(['A', 'B']);
    });

    test('explicit skip of protected B is immediate even paused', () => {
        const step = review();
        expect(step(16, { kind: 'skip', id: 'B' }, { paused: true }).seek).toEqual({ time: 30, ids: ['B'], reason: 'skip' });
    });

    test.each(['allow', 'resume-speed'] as const)('explicit %s overrides protection for this B visit only', kind => {
        const step = review();
        expect(step(16, { kind, id: 'B' }).speed).toEqual(['B']);
        expect(step(17).speed).toEqual(['B']);
        step(12, { kind: 'seek' });
        expect(step(16, { kind: 'seek' }).speed).toEqual([]);
    });

    test('explicit restart of A ends its review, intrinsic disable still wins', () => {
        const step = review();
        expect(step(16, { kind: 'allow', id: 'A' }).speed.sort()).toEqual(['A', 'B']);
        expect(step(16, { kind: 'allow', id: 'B' }, { disabled: true }).speed).toEqual([]);
    });

    test('a later undo is not bypassed by a peer restart from an earlier interaction', () => {
        const step = review();
        expect(step(16, { kind: 'resume-speed', id: 'B' }).speed).toEqual(['B']);
        expect(step(18, { kind: 'undo', id: 'A' }).speed).toEqual([]);
        step(10, { kind: 'handoff' });
        expect(step(16).speed).toEqual([]);
        expect(step(20).speed).toEqual(['B']);
    });

    test.each(['auto', 'manual', 'mark', 'ignore'] as const)('peer policy %s retains its own behavior', policy => {
        const step = review({ segments: [A, { ...B, policy }] });
        const protectedPlan = step(16);
        expect(protectedPlan.protectedBy.B).toEqual(policy === 'auto' ? ['A'] : undefined);
        expect(protectedPlan.state.visits.B.excluded).toBeUndefined();
        expect(protectedPlan.speed).toEqual([]);
        expect(step(20).speed).toEqual(policy === 'auto' ? ['B'] : []);
    });
});

describe('overlap relation and review lifetime', () => {
    test.each([
        [10, 20, true], [12, 18, true], [5, 25, true], [5, 15, true], [15, 30, true],
        [0, 10, false], [20, 30, false], [25, 40, false],
    ])('A [10,20), B [%s,%s): direct positive intersection=%s', (start, end, protectedPeer) => {
        const step = sequence({ segments: [A, segment('B', start as number, end as number)] });
        step(15, { kind: 'undo', id: 'A' });
        expect(step(15).protectedBy.B).toEqual(protectedPeer ? ['A'] : undefined);
    });

    test('protection does not propagate via a protected peer to a third segment', () => {
        const step = review({ segments: [A, B, segment('C', 25, 40)] });
        expect(step(16).protectedBy).toEqual({ B: ['A'] });
        const end = step(20);
        expect(end.protectedBy).toEqual({});
        expect(step(26).speed.sort()).toEqual(['B', 'C']);
    });

    test('multiple explicit sources combine; input order cannot change the constraints', () => {
        const segments = [A, segment('B', 12, 25), segment('C', 8, 30)];
        const orders = [segments, [segments[2], segments[0], segments[1]], [...segments].reverse()];
        for (const order of orders) {
            const step = sequence({ segments: order });
            step(15, { kind: 'undo', id: 'A' });
            step(10, { kind: 'handoff' });
            step(15, { kind: 'undo', id: 'B' });
            step(12, { kind: 'handoff' });
            const both = step(15);
            expect(both.protectedBy.C).toEqual(['A', 'B']);
            expect(both.speed).toEqual([]);
            expect(step(20).protectedBy.C).toEqual(['B']);
            expect(step(25).speed).toEqual(['C']);
        }
    });

    test.each(['shorten', 'remove'] as const)('data %s of review source releases peers at the current position', change => {
        const step = review(); step(16);
        const segments = change === 'shorten' ? [{ ...A, end: 14 }, B] : [B];
        expect(step(16, { kind: 'data' }, { segments }).speed).toEqual(['B']);
    });

    test('new overlapping data joins current protection without inheriting an exclusion', () => {
        const step = review({ segments: [A] });
        const plan = step(16, { kind: 'data' }, { segments: [A, B] });
        expect(plan.protectedBy.B).toEqual(['A']);
        expect(plan.state.visits.B.excluded).toBeUndefined();
        expect(plan.speed).toEqual([]);
    });

    test('failed return seek cannot leave indefinite protection outside its source', () => {
        const step = sequence(); step(22);
        expect(step(22, { kind: 'undo', id: 'A' }).speed).toEqual([]);
        expect(step(22).speed).toEqual(['B']);
    });

    test('pause and buffering preserve the source, without starting effects at its end', () => {
        const step = review();
        expect(step(16, { kind: 'pause' }, { paused: true }).protectedBy.B).toEqual(['A']);
        expect(step(16, { kind: 'time' }, { waiting: true }).speed).toEqual([]);
        expect(step(20, { kind: 'seek' }, { paused: true }).speed).toEqual([]);
        expect(step(20, { kind: 'resume' }).speed).toEqual(['B']);
    });

    test('undo mute constrains automatic mute only, while forced return protects skips', () => {
        const segments: RuleSegment[] = [{ ...A, action: 'mute' }, { ...B, action: 'mute' }, segment('C', 15, 30)];
        const step = sequence({ segments }); step(16);
        const undo = step(16, { kind: 'undo', id: 'A' });
        expect(undo.seek).toBeUndefined();
        expect(undo.mute).toEqual([]);
        expect(undo.speed).toEqual(['C']);
        expect(step(20).mute).toEqual(['B']);
        const forced = step(16, { kind: 'undo', id: 'A', forceSeek: true });
        expect(forced.protectedBy).toEqual({ C: ['A'] });
        expect(forced.seek?.time).toBe(10);
    });
});
