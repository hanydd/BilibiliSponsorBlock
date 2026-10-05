import { resolveSegmentPolicy } from '../src/content/skipRules/policy';
import { rulePreferences } from '../src/content/skipRules/preferences';
import { playbackMethod, speedUpTarget } from '../src/content/skipRules/playback';
import { ruleDefinitions, RULES } from '../src/content/skipRules/rules';

test('only existing preferences map into configurable engine inputs', () => {
    expect(rulePreferences({ enableSpeedUp: true, skipOnSeekToSegment: false,
        advanceSkipNotice: false, skipNoticeDurationBefore: 7, dontShowNotice: true, previewIncludeOtherSegments: true })).toEqual({
        speedUp: true, resumeAction: 'continue', speedUpResumeAction: 'continue', skipOnEntry: false, previewLead: 0, showNotices: false, includeOtherSegments: true,
    });
    expect(ruleDefinitions[RULES.within].settings).toEqual([]);
    expect(ruleDefinitions[RULES.paused].settings).toEqual([]);
    expect(ruleDefinitions[RULES.display].settings).toEqual(['skipNoticeDuration']);
});

test('global speed option keeps instant exceptions for short segments and drafts', () => {
    const s = { id: 'A', start: 10, end: 20, policy: 'auto' as const, action: 'skip' as const };
    expect(playbackMethod(s, { speedUp: true })).toBe('speed');
    expect(playbackMethod({ ...s, end: 10.4 }, { speedUp: true })).toBe('seek');
    expect(playbackMethod({ ...s, draft: true }, { speedUp: true })).toBe('seek');
    expect(playbackMethod({ ...s, action: 'mute' }, { speedUp: true })).toBe('mute');
});

test.each([[1, 4, 4], [4, 4, 8], [8, 4, 8], [10, 10, 16], [1, NaN, 2]])(
    'rate policy preserves existing behavior: baseline %s, configured %s -> %s', (original, configured, expected) => {
        expect(speedUpTarget(original, configured)).toBe(expected);
    }
);


test('source policies compose in the existing order and explain overrides', () => {
    const context = { id: 'A', categoryPolicy: 'manual' as const, action: 'skip' as const,
        videoHasMusic: true, categoryHasFullLabel: true, hidden: false, externalSource: false };
    const config = { autoSkipOnMusicVideos: true, manualSkipOnFullVideo: true, muteSegments: true };
    const result = resolveSegmentPolicy(context, config);
    expect(result.policy).toBe('manual');
    expect(result.policyTrace.map(t => [t.rule, t.result])).toEqual([
        ['SOURCE-MUSIC', 'auto'], ['SOURCE-FULL-VIDEO', 'manual'],
    ]);
    expect(resolveSegmentPolicy({ ...context, hidden: true }, config).policy).toBe('ignore');
});
