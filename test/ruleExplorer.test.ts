import { advance, available, makeSimulation, modes, operations, rows, scenario, Settings, step } from '../src/options/rules/model';
import { ruleDefinitions } from '../src/content/skipRules/rules';

const settings: Settings = { entry: true, preview: 3, duration: 4, rate: 4, showCards: true, resumeEntry: 'continue', resumeSpeed: 'continue' };

test('global disable suppresses automatic actions and cards in the explorer', () => {
    for (const mode of ['auto', 'fast'] as const) {
        const result = scenario({ ...settings, disabled: true }, mode, 'ready', 'natural');
        expect(result.effects).toEqual([]);
        expect(result.state.ownedRate).toBe(false);
        expect(result.cards.some(card => card.visible)).toBe(false);
    }
});

test('all available matrix cases use known production rules without mutating settings', () => {
    const frozen = Object.freeze({ ...settings });
    for (const mode of modes) for (const state of rows(mode)) for (const operation of operations) {
        if (!available(mode, state, operation.id)) continue;
        const result = scenario(frozen, mode, state, operation.id);
        expect(Number.isFinite(result.state.time)).toBe(true);
        expect(result.trace.every(trace => !!ruleDefinitions[trace.rule])).toBe(true);
        if (mode === 'ignore' || mode === 'mark') {
            expect(result.effects).toEqual([]);
            expect(result.cards.some(card => card.visible)).toBe(false);
        }
    }
});

test('simulated pause/resume and adjacent fast cards follow the real evaluator', () => {
    let result = step(makeSimulation({ ...settings, resumeEntry: 'manual' }, 'auto', 'ready'), { kind: 'pause' });
    result = step(result.state, { kind: 'resume' });
    expect(result.state.time).toBe(15);
    expect(result.cards[0].label).toBe('waiting');
    expect(step(result.state, { kind: 'skip' }).state.time).toBe(20);
    result = step(makeSimulation(settings, 'fast', 'preview', 'adjacent', 'auto'), { kind: 'time', time: 10 });
    result = advance(result.state, 2.5);
    expect(result.state.time).toBe(20);
    expect(result.cards.map(c => c.phase)).toEqual(['completed', 'speeding']);
    expect(result.state.rate).toBe(4);
});

test('failed execution never receives successful feedback, including continuous playback', () => {
    const result = step(makeSimulation(settings, 'auto', 'ready'), { kind: 'skip', fail: true });
    expect(result.state.time).toBe(15);
    expect(result.failed).toBe(true);
    expect(result.cards[0].phase).not.toBe('completed');
    const later = advance(result.state, 1, true);
    expect(later.state.time).toBe(16);
    expect(later.failed).toBe(true);
    expect(later.cards[0].phase).not.toBe('completed');
});

test('hover holds display lifetime and never resets it or cancels the visit', () => {
    let result = step(makeSimulation(settings, 'auto', 'ready'), { kind: 'skip' });
    result = step(result.state, { kind: 'wall', seconds: 1 });
    expect(result.cards[0].seconds).toBe(3);
    result.state.hovered = true;
    result = step(result.state, { kind: 'wall', seconds: 8 });
    expect(result.cards[0].seconds).toBe(3);
    result.state.hovered = false;
    result = step(result.state, { kind: 'wall', seconds: 3 });
    expect(result.cards[0].visible).toBe(false);
    expect(result.state.rules.visits.A.excluded).toBeUndefined();
});

test('speed target and user ownership are shared with production code', () => {
    let result = step(makeSimulation(settings, 'fast', 'active', 'overlap', 'auto'), { kind: 'time', time: 16 });
    result = step(result.state, { kind: 'rate', rate: 2 });
    expect(result.state.rate).toBe(2);
    expect(result.cards.map(c => c.label)).toEqual(['custom', 'custom']);
    result = step(result.state, { kind: 'seek', time: 35 });
    expect(result.state.rate).toBe(2);
});

test('explorer composes music, full-video, minimum duration and mute using the production first stage', () => {
    const policy = { autoSkipOnMusicVideos: true, manualSkipOnFullVideo: false, muteSegments: true, minDuration: 0 };
    const music = scenario({ ...settings, policy, context: 'music' }, 'manual', 'ready', 'natural');
    expect(music.effects[0]?.time).toBe(20);
    const full = scenario({ ...settings, policy: { ...policy, manualSkipOnFullVideo: true }, context: 'music-full' }, 'manual', 'ready', 'natural');
    expect(full.effects).toEqual([]);
    expect(full.cards[0].automatic).toBe(false);
    const short = scenario({ ...settings, policy: { ...policy, minDuration: 11 } }, 'auto', 'ready', 'natural');
    expect(short.cards).toEqual([]);
    expect(short.trace.some(t => t.rule === 'POLICY-SHORT')).toBe(true);
    const mute = scenario({ ...settings, policy, context: 'mute' }, 'auto', 'ready', 'natural');
    expect(mute.state.muted).toBe(true);
    expect(mute.effects).toEqual([]);
    const cancelled = step(mute.state, { kind: 'cancel' });
    expect(cancelled.state.muted).toBe(false);
});
