import { evaluateRules } from '../src/content/skipRules/engine';
import { emptyRuleState, RuleEvent, RuleInput, RuleSegment } from '../src/content/skipRules/types';

const segment = (id = 'A', start = 10, end = 30): RuleSegment => ({ id, start, end, action: 'skip', policy: 'auto' });
function session(overrides: Partial<RuleInput> = {}) {
    let state = emptyRuleState();
    let input: RuleInput = { time: 0, paused: false, waiting: false, disabled: false, speedUp: false,
        skipOnEntry: true, previewLead: 0, editing: false, includeOtherSegments: false, segments: [segment()], ...overrides };
    return (change: Partial<RuleInput>, event: RuleEvent = { kind: 'time' }) => {
        input = { ...input, ...change };
        const plan = evaluateRules(state, input, event);
        state = plan.state;
        return plan;
    };
}

test.each(['continue', 'manual'] as const)('paused entry resumes with %s policy', resumeAction => {
    const step = session({ resumeAction });
    step({ time: 0, paused: true }, { kind: 'pause' });
    step({ time: 15 }, { kind: 'seek' });
    const resumed = step({ paused: false }, { kind: 'resume' });
    expect(resumed.seek?.time).toBe(resumeAction === 'continue' ? 30 : undefined);
    expect(resumed.cards.A.phase).toBe('pending');
    expect(resumed.cards.A.clock).toEqual({ kind: 'media', boundary: 'end', deadline: 30 });
    expect(resumed.trace).toContainEqual({ id: 'A', rule: 'RESUME-ENTRY', result: resumeAction === 'manual' ? 'manual-for-this-visit' : 'follow-segment-policy' });
});

test('resume preference runs on first unpaused observation, before playing may arrive', () => {
    const step = session({ resumeAction: 'manual' });
    step({ time: 15, paused: true });
    expect(step({ paused: false }).seek).toBeUndefined();
    expect(step({}, { kind: 'resume' }).seek).toBeUndefined();
    expect(step({ time: 18 }, { kind: 'seek' }).seek).toBeUndefined();
    expect(step({}, { kind: 'data' }).seek).toBeUndefined();
    step({ time: 35 }, { kind: 'seek' });
    expect(step({ time: 15 }, { kind: 'seek' }).seek?.time).toBe(30);
});

test('paused entry that leaves before resume cannot suppress a later visit', () => {
    const step = session({ resumeAction: 'manual' });
    step({ time: 15, paused: true }, { kind: 'seek' });
    step({ time: 35 }, { kind: 'seek' });
    expect(step({ paused: false }, { kind: 'resume' }).seek).toBeUndefined();
    expect(step({ time: 15 }, { kind: 'seek' }).seek?.time).toBe(30);
});

test.each(['continue', 'manual'] as const)('previously active speed resumes with %s policy', speedUpResumeAction => {
    const step = session({ speedUp: true, speedUpResumeAction, resumeAction: 'manual' });
    expect(step({ time: 15 }).speed).toEqual(['A']);
    step({ paused: true }, { kind: 'pause' });
    const result = step({ paused: false }, { kind: 'resume' });
    expect(result.speed).toEqual(speedUpResumeAction === 'continue' ? ['A'] : []);
    expect(result.cards.A.phase).toBe(speedUpResumeAction === 'continue' ? 'speeding' : 'speed-paused');
});

test('fast segment entered while paused uses entry preference, not speed resumption', () => {
    const step = session({ speedUp: true, resumeAction: 'manual', speedUpResumeAction: 'continue' });
    step({ time: 15, paused: true }, { kind: 'seek' });
    expect(step({ paused: false }, { kind: 'resume' }).speed).toEqual([]);
});

test('leaving a paused fast visit and entering another uses the new visit rule', () => {
    const step = session({ speedUp: true, resumeAction: 'continue', speedUpResumeAction: 'manual' });
    step({ time: 15 }); step({ paused: true }, { kind: 'pause' });
    step({ time: 35 }, { kind: 'seek' }); step({ time: 15 }, { kind: 'seek' });
    expect(step({ paused: false }, { kind: 'resume' }).speed).toEqual(['A']);
});

test('buffering alone is not a video pause', () => {
    const step = session({ speedUp: true, resumeAction: 'manual', speedUpResumeAction: 'manual' });
    step({ time: 15 }); step({ waiting: true }, { kind: 'pause' });
    expect(step({ waiting: false }, { kind: 'resume' }).speed).toEqual(['A']);
});

test('actual pause followed by buffering retains preference until playback can run', () => {
    const step = session({ resumeAction: 'manual' });
    step({ time: 15, paused: true });
    expect(step({ paused: false, waiting: true }).seek).toBeUndefined();
    expect(step({ waiting: false }, { kind: 'resume' }).seek).toBeUndefined();
    expect(step({}).state.visits.A.auto).toBe(false);
});

test('explicit skip still executes while paused', () => {
    const step = session({ resumeAction: 'manual' });
    step({ time: 15, paused: true });
    expect(step({}, { kind: 'skip', id: 'A' }).seek?.time).toBe(30);
    expect(step({ time: 30 }, { kind: 'applied', ids: ['A'] }).cards.A.phase).toBe('completed');
});

test('explicit restart while paused survives polling and overrides manual-on-resume', () => {
    const step = session({ speedUp: true, resumeAction: 'manual', speedUpResumeAction: 'manual' });
    step({ time: 15 }); step({ paused: true }, { kind: 'pause' });
    step({}, { kind: 'pause-speed', id: 'A' });
    step({}, { kind: 'resume-speed', id: 'A' });
    step({}); step({});
    expect(step({ paused: false }, { kind: 'resume' }).speed).toEqual(['A']);
});

test('resume preferences do not undo explicit cancellation or closure', () => {
    for (const kind of ['dismiss', 'deny', 'user-rate'] as const) {
        const step = session({ speedUp: true, resumeAction: 'continue', speedUpResumeAction: 'continue' });
        step({ time: 15 }); step({ paused: true }, { kind: 'pause' });
        step({}, kind === 'user-rate' ? { kind, ids: ['A'] } : { kind, id: 'A' });
        const result = step({ paused: false }, { kind: 'resume' });
        expect(result.speed).toEqual([]);
        if (kind === 'dismiss') expect(result.cards.A).toBeUndefined();
    }
});

test('overlapping members apply resume preference independently', () => {
    const step = session({ resumeAction: 'manual', segments: [segment(), segment('B', 15, 40)] });
    step({ time: 20, paused: true });
    const result = step({ paused: false }, { kind: 'resume' });
    expect(result.seek).toBeUndefined();
    expect(Object.values(result.cards).map(c => c.phase)).toEqual(['pending', 'pending']);
});

test('manual, mute, preview and completed states do not acquire a resume override', () => {
    const step = session({ resumeAction: 'manual', speedUpResumeAction: 'manual', segments: [
        { ...segment('manual'), policy: 'manual' }, { ...segment('mute'), action: 'mute' }, { ...segment('draft'), draft: true },
    ], previewId: 'draft' });
    step({ time: 15, paused: true });
    const result = step({ paused: false }, { kind: 'resume' });
    expect(result.seek?.ids).toEqual(['draft']);
    expect(result.mute).toEqual(['mute']);
    expect(result.trace.some(t => t.rule.startsWith('RESUME-'))).toBe(false);
});
