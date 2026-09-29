import { PlaybackState, transitionPlayback } from '../src/content/skipRules/playback';
import { primaryAction } from '../src/content/skipRules/intents';
import { emptyRuleState, RulePlan } from '../src/content/skipRules/types';

const playing = { paused: false, waiting: false };
const idle: Pick<RulePlan, 'state' | 'speed' | 'mute'> = { state: emptyRuleState(), speed: [], mute: [] };
const active = { state: { visits: { A: { number: 1, inside: true, entered: true, auto: true, start: 10, end: 20, phase: 'speeding' as const },
    B: { number: 1, inside: true, entered: true, auto: true, start: 10, end: 20, phase: 'muted' as const } } }, speed: ['A'], mute: ['B'] };

test.each([false, true])('shared playback restores the original speed and mute=%s after overlapping effects', muted => {
    const original: PlaybackState = { rate: 1.5, muted };
    const running = transitionPlayback(original, active, playing, 4);
    expect(running).toMatchObject({ rate: 4, muted: true });
    for (const stopped of [{ paused: true, waiting: false }, { paused: false, waiting: true }]) {
        expect(transitionPlayback(running, active, stopped, 8)).toEqual(running);
        expect(transitionPlayback(original, active, stopped, 4)).toEqual(original);
        expect(transitionPlayback(running, idle, stopped, 4)).toMatchObject({ ...original, speed: undefined, mute: undefined });
    }
    expect(transitionPlayback(running, idle, playing, 4)).toMatchObject({ ...original, speed: undefined, mute: undefined });
});

test('releasing effects preserves a user rate and unmute', () => {
    const owned = transitionPlayback({ rate: 1, muted: false }, active, playing, 4);
    expect(transitionPlayback({ ...owned, rate: 2, muted: false }, idle, playing, 4)).toEqual({ rate: 2, muted: false, speed: undefined, mute: undefined });
});

test.each([
    ['preview', true, false, 'deny'], ['preview', false, false, 'allow'], ['preview', true, true, 'allow'],
    ['pending', false, false, 'skip'], ['speeding', true, false, 'skip'], ['speed-paused', false, false, 'skip'],
    ['completed', false, false, 'undo'], ['muted', true, false, 'undo'], ['muted', true, true, 'skip'],
] as const)('primary action for %s automatic=%s forceSeek=%s is %s', (phase, automatic, forceSeek, kind) => {
    expect(primaryAction('A', { phase, automatic }, forceSeek)).toEqual({ kind, id: 'A', forceSeek });
});
