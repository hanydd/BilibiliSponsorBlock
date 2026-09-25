import { evaluateRules } from '../src/content/skipRules/engine';
import { emptyRuleState, Policy, RuleEvent, RuleInput, RuleSegment, RuleState } from '../src/content/skipRules/types';

const segment = (id = 'A', start = 10, end = 20, policy: Policy = 'auto'): RuleSegment => ({ id, start, end, policy, action: 'skip' });
const defaults: RuleInput = { time: 0, paused: false, waiting: false, disabled: false, speedUp: false,
    skipOnEntry: true, previewLead: 0, editing: false, includeOtherSegments: false, segments: [segment()] };
function sequence(overrides: Partial<RuleInput> = {}) {
    let state: RuleState = emptyRuleState();
    return (time: number, event: RuleEvent = { kind: 'time' }, change: Partial<RuleInput> = {}) => {
        const result = evaluateRules(state, { ...defaults, ...overrides, ...change, time }, event);
        state = result.state;
        return result;
    };
}

describe('skip rule contract', () => {
    test.each([5, 25])('outside→inside from %s follows policy independent of direction', from => {
        const step = sequence(); step(from);
        expect(step(15, { kind: 'seek' }).seek?.time).toBe(20);
    });
    test('inside→inside preserves a manual entry, even if the entry setting changes', () => {
        const step = sequence(); step(5);
        expect(step(12, { kind: 'seek' }, { skipOnEntry: false }).seek).toBeUndefined();
        expect(step(18, { kind: 'seek' }).seek).toBeUndefined();
    });
    test('one seek is inside→inside for A and outside→inside for B', () => {
        const step = sequence({ segments: [segment('A', 10, 30, 'manual'), segment('B', 20, 40)] });
        step(15);
        const result = step(25, { kind: 'seek' });
        expect(result.seek?.ids).toEqual(['B']);
        expect(result.trace).toContainEqual({ id: 'A', rule: 'ENTER-INSIDE-IN', result: 'preserve-visit' });
    });
    test('pause retains only the final eligible entry, without auto operations', () => {
        const step = sequence(); step(5);
        expect(step(12, { kind: 'seek' }, { paused: true }).seek).toBeUndefined();
        step(18, { kind: 'seek' }, { paused: true });
        expect(step(18, { kind: 'resume' }).seek?.time).toBe(20);
    });
    test('pause outside→inside→outside does not skip on resume', () => {
        const step = sequence(); step(5); step(12, { kind: 'seek' }, { paused: true });
        step(22, { kind: 'seek' }, { paused: true });
        expect(step(22, { kind: 'resume' }).seek).toBeUndefined();
    });
    test('dismiss lasts for one visit, surviving data refresh and inside seeks', () => {
        const step = sequence({ speedUp: true }); step(12);
        expect(step(12, { kind: 'dismiss', id: 'A' }).speed).toEqual([]);
        expect(step(15, { kind: 'data' }).cards).toEqual({});
        expect(step(18, { kind: 'seek' }).speed).toEqual([]);
        step(25, { kind: 'seek' });
        expect(step(15, { kind: 'seek' }).speed).toEqual(['A']);
    });
    test('dismissed preview excludes the upcoming visit, not every future visit', () => {
        const step = sequence({ previewLead: 3 });
        expect(step(8).cards.A.phase).toBe('preview');
        step(8, { kind: 'dismiss', id: 'A' });
        expect(step(10).seek).toBeUndefined();
        step(21);
        expect(step(12, { kind: 'seek' }).seek?.time).toBe(20);
    });
    test('explicit skip is immediate even with speedup and paused video', () => {
        const step = sequence({ speedUp: true, paused: true }); step(12);
        expect(step(12, { kind: 'skip', id: 'A' }).seek?.time).toBe(20);
    });
    test('undo returns segment start and does not auto skip again', () => {
        const step = sequence(); step(15);
        step(20, { kind: 'applied', ids: ['A'] });
        expect(step(20, { kind: 'undo', id: 'A' }).seek?.time).toBe(10);
        expect(step(10, { kind: 'handoff' }).seek).toBeUndefined();
    });
    test('editing excludes other segments unless the user includes them', () => {
        const step = sequence({ editing: true });
        expect(step(12).seek).toBeUndefined();
        expect(step(12, { kind: 'data' }, { includeOtherSegments: true }).seek?.time).toBe(20);
    });
    test('draft is only automatically executed as the explicitly selected preview', () => {
        const step = sequence({ segments: [{ ...segment(), draft: true }] });
        expect(step(12).seek).toBeUndefined();
        expect(step(12, { kind: 'data' }, { previewId: 'A' }).seek?.time).toBe(20);
    });
    test('adjacent speedup keeps rate demand continuous and cards independent', () => {
        const step = sequence({ speedUp: true, segments: [segment(), segment('B', 20, 30)] });
        expect(step(12).speed).toEqual(['A']);
        const next = step(20);
        expect(next.speed).toEqual(['B']);
        expect(next.cards.A.phase).toBe('completed');
        expect(next.cards.B.phase).toBe('speeding');
    });
    test('overlap dismissal removes only the cancelled member', () => {
        const step = sequence({ speedUp: true, segments: [segment('A', 10, 30), segment('B', 15, 20)] });
        step(16); const result = step(16, { kind: 'dismiss', id: 'A' });
        expect(result.speed).toEqual(['B']);
        expect(result.cards.A).toBeUndefined();
        expect(step(20).speed).toEqual([]);
    });
    test('manual mute inside automatic speedup never mutes by itself', () => {
        const step = sequence({ speedUp: true, segments: [segment('A', 10, 30), { ...segment('M', 12, 18, 'manual'), action: 'mute' }] });
        const plan = step(15);
        expect(plan.speed).toEqual(['A']); expect(plan.mute).toEqual([]);
        expect(plan.cards.M.phase).toBe('pending');
    });
    test('normal gaps are not merged', () => {
        expect(sequence({ segments: [segment(), segment('B', 20.1, 30)] })(12).seek?.time).toBe(20);
    });
    const policies: Policy[] = ['auto', 'manual', 'mark', 'ignore'];
    for (const first of policies) for (const second of policies) {
        test(`adjacent policies ${first} → ${second}`, () => {
            const step = sequence({ segments: [segment('A', 10, 20, first), segment('B', 20, 30, second)] });
            const plan = step(12);
            expect(plan.seek?.time).toBe(first === 'auto' ? second === 'auto' ? 30 : 20 : undefined);
            expect(!!plan.cards.A).toBe(first === 'auto' || first === 'manual');
        });
    }
    test('pure evaluation does not mutate input state', () => {
        const state = Object.freeze({ time: 0, visits: Object.freeze({}) });
        expect(evaluateRules(state, { ...defaults, time: 12 }, { kind: 'time' }).seek?.time).toBe(20);
    });
});

test('manual mute remains active and undo does not move progress', () => {
    const step = sequence({ segments: [{ ...segment('M', 10, 30, 'manual'), action: 'mute' }] });
    step(12);
    expect(step(12, { kind: 'skip', id: 'M' }).mute).toEqual(['M']);
    expect(step(14).mute).toEqual(['M']);
    const cancelled = step(14, { kind: 'undo', id: 'M' });
    expect(cancelled.mute).toEqual([]);
    expect(cancelled.seek).toBeUndefined();
    expect(step(16).mute).toEqual([]);
});

test('only explicit force-seek on a mute card moves the progress', () => {
    const step = sequence({ segments: [{ ...segment('M', 10, 30, 'manual'), action: 'mute' }] });
    expect(step(12, { kind: 'skip', id: 'M', forceSeek: true }).seek?.time).toBe(30);
});

test('previews update their automatic state in place when cancelled', () => {
    const step = sequence({ previewLead: 3 });
    const first = step(8).cards.A;
    expect(first.automatic).toBe(true);
    const cancelled = step(8, { kind: 'deny', id: 'A' }).cards.A;
    expect(cancelled.automatic).toBe(false);
    expect(cancelled.visit).toBe(first.visit);
    expect(step(10).seek).toBeUndefined();
});

test('highlights use navigation without becoming merged skip intervals', () => {
    const point = { ...segment('P', 25, 25, 'manual'), action: 'poi' as const };
    expect(sequence({ segments: [point] })(0).poi).toBe('P');
    expect(sequence({ segments: [{ ...point, policy: 'auto' }] })(0).seek?.time).toBe(25);
});

test('updated shorter intervals stop contributing speed immediately', () => {
    const step = sequence({ speedUp: true, segments: [segment('A', 10, 60)] });
    expect(step(25).speed).toEqual(['A']);
    const refreshed = step(25, { kind: 'data' }, { segments: [segment('A', 10, 20)] });
    expect(refreshed.speed).toEqual([]);
    expect(refreshed.cards.A.phase).toBe('completed');
});

test('waiting cannot advance a future mute interval on wall time', () => {
    const step = sequence({ speedUp: true, segments: [segment('A', 10, 60), { ...segment('M', 20, 30), action: 'mute' }] });
    step(15);
    for (let i = 0; i < 10; i++) expect(step(15, { kind: 'time' }, { waiting: true }).mute).toEqual([]);
    expect(step(21, { kind: 'resume' }).mute).toEqual(['M']);
});

test('closing isolated editing does not immediately skip the inspected content', () => {
    const step = sequence({ editing: true });
    step(15);
    expect(step(15, { kind: 'edit-end' }, { editing: false }).seek).toBeUndefined();
    expect(step(16, { kind: 'time' }, { editing: false }).seek).toBeUndefined();
    step(25, { kind: 'seek' }, { editing: false });
    expect(step(15, { kind: 'seek' }, { editing: false }).seek?.time).toBe(20);
});

test('undo of merged overlap returns to the selected segment without another member re-skipping', () => {
    const step = sequence({ segments: [segment('A', 10, 30), segment('B', 20, 40)] });
    step(15); step(40, { kind: 'applied', ids: ['A', 'B'] });
    expect(step(40, { kind: 'undo', id: 'B' }).seek?.time).toBe(20);
    expect(step(20, { kind: 'handoff' }).seek).toBeUndefined();
    expect(step(25).seek).toBeUndefined();
});
