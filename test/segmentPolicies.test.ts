import { evaluateRules } from '../src/content/skipRules/engine';
import { prepareSegmentPolicies } from '../src/content/skipRules/policy';
import { emptyRuleState, Policy, PolicySettings, RuleInput } from '../src/content/skipRules/types';
import { refreshMinimumDuration } from '../src/content/segmentVisibility';
import { ActionType, SponsorHideType, SponsorTime } from '../src/types';

const settings: PolicySettings = { autoSkipOnMusicVideos: false, manualSkipOnFullVideo: false, muteSegments: true, minDuration: 0 };
const input = (policy: Policy = 'auto', prefs: Partial<PolicySettings> = {}): RuleInput => ({
    time: 15, paused: false, waiting: false, disabled: false, speedUp: false, skipOnEntry: true,
    previewLead: 3, editing: false, includeOtherSegments: false, policySettings: { ...settings, ...prefs },
    videoFacts: { hasMusic: true, fullVideoCategories: ['sponsor'] },
    segments: [{ id: 'A', start: 10, end: 20, action: 'skip', category: 'sponsor', policy }],
});

test.each(['auto', 'manual', 'mark', 'ignore'] as Policy[])('music/full-video policies compose for %s without modifying the category default', policy => {
    for (const music of [false, true]) for (const full of [false, true]) {
        const raw = input(policy, { autoSkipOnMusicVideos: music, manualSkipOnFullVideo: full });
        const expected = policy === 'ignore' ? 'ignore' : full && (music || policy === 'auto') ? 'manual' : music ? 'auto' : policy;
        const prepared = prepareSegmentPolicies(raw);
        expect(prepared.segments[0].policy).toBe(expected);
        expect(raw.segments[0].policy).toBe(policy);
        const plan = evaluateRules(emptyRuleState(), raw, { kind: 'data' });
        expect(!!plan.seek).toBe(expected === 'auto');
    }
});

test('full-video override uses the matching category and runs before merging', () => {
    const raw = input('auto', { manualSkipOnFullVideo: true });
    raw.segments = [...raw.segments, { id: 'B', start: 20, end: 30, action: 'skip', category: 'selfpromo', policy: 'auto' }];
    expect(evaluateRules(emptyRuleState(), raw, { kind: 'data' }).seek).toBeUndefined();
    raw.time = 21;
    expect(evaluateRules(emptyRuleState(), raw, { kind: 'data' }).seek?.ids).toEqual(['B']);
});

test('duration boundaries have their own reason and are recalculated after configuration changes', () => {
    const raw = input('auto', { minDuration: 11 });
    let plan = evaluateRules(emptyRuleState(), raw, { kind: 'data' });
    expect(plan.seek).toBeUndefined();
    expect(plan.cards.A).toBeUndefined();
    expect(plan.trace.some(t => t.rule === 'POLICY-SHORT')).toBe(true);
    raw.policySettings.minDuration = 10;
    plan = evaluateRules(plan.state, raw, { kind: 'data' });
    expect(plan.seek?.time).toBe(20);
    expect(plan.trace.some(t => t.rule === 'POLICY-SHORT')).toBe(false);
});

test('reenabling a policy cannot undo a dismissal in the same visit', () => {
    const raw = input('manual', { autoSkipOnMusicVideos: false });
    let plan = evaluateRules(emptyRuleState(), raw, { kind: 'data' });
    plan = evaluateRules(plan.state, raw, { kind: 'dismiss', id: 'A' });
    raw.policySettings = { ...settings, autoSkipOnMusicVideos: true, minDuration: 11 };
    plan = evaluateRules(plan.state, raw, { kind: 'data' });
    raw.policySettings.minDuration = 0;
    plan = evaluateRules(plan.state, raw, { kind: 'data' });
    expect(plan.seek).toBeUndefined();
    expect(plan.cards.A).toBeUndefined();
    expect(plan.state.visits.A.excluded).toBe('dismiss');
});

test('muting remains an action permission and never converts ordinary skips to mute', () => {
    const raw = input('auto', { muteSegments: false });
    expect(evaluateRules(emptyRuleState(), raw, { kind: 'data' }).seek?.time).toBe(20);
    raw.segments[0].action = 'mute';
    let plan = evaluateRules(emptyRuleState(), raw, { kind: 'data' });
    expect(plan.mute).toEqual([]);
    expect(plan.trace.some(t => t.rule === 'POLICY-MUTE-DISABLED')).toBe(true);
    raw.policySettings.muteSegments = true;
    plan = evaluateRules(plan.state, raw, { kind: 'data' });
    expect(plan.mute).toEqual(['A']);
    expect(plan.seek).toBeUndefined();
});

test('pausing and explicit skip apply after the first-layer full-video policy', () => {
    const raw = input('auto', { manualSkipOnFullVideo: true }); raw.paused = true;
    const plan = evaluateRules(emptyRuleState(), raw, { kind: 'data' });
    expect(plan.seek).toBeUndefined();
    expect(plan.cards.A.automatic).toBe(false);
    expect(evaluateRules(plan.state, raw, { kind: 'skip', id: 'A' }).seek?.time).toBe(20);
});

test('short visibility projection clears only derived flags, preserving user hiding and votes', () => {
    const segments = [undefined, SponsorHideType.Hidden, SponsorHideType.Downvoted, SponsorHideType.MinimumDuration]
        .map((hidden, index) => ({ UUID: String(index), segment: [10, 20], category: 'sponsor', actionType: ActionType.Skip, hidden } as SponsorTime));
    refreshMinimumDuration(segments, 11);
    expect(segments.map(s => s.hidden)).toEqual([SponsorHideType.MinimumDuration, SponsorHideType.Hidden, SponsorHideType.Downvoted, SponsorHideType.MinimumDuration]);
    refreshMinimumDuration(segments, 10);
    expect(segments.map(s => s.hidden)).toEqual([undefined, SponsorHideType.Hidden, SponsorHideType.Downvoted, undefined]);
});
