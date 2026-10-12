import { RULES } from './rules';
import type { Policy, PolicySettings, RuleInput, RuleSegment } from './types';

export interface PolicyContext {
    id: string;
    categoryPolicy: Policy;
    action: RuleSegment['action'];
    videoHasMusic: boolean;
    categoryHasFullLabel: boolean;
    hidden: boolean;
    externalSource: boolean;
    duration?: number;
    draft?: boolean;
}

export function belowMinimumDuration(duration: number, minimum: number): boolean {
    return duration > 0 && minimum > 0 && duration < minimum;
}

/** Preserve the existing override order, while keeping its reasons with the segment. */
const policyRules = [
    { rule: RULES.music, matches: (c: PolicyContext, p: Policy, s: PolicySettings) => s.autoSkipOnMusicVideos && c.videoHasMusic && c.action === 'skip' && p !== 'ignore',
        apply: (): Policy => 'auto' },
    { rule: RULES.fullVideo, matches: (c: PolicyContext, p: Policy, s: PolicySettings) => s.manualSkipOnFullVideo && c.categoryHasFullLabel && p === 'auto',
        apply: (): Policy => 'manual' },
    { rule: RULES.short, matches: (c: PolicyContext, _p: Policy, s: PolicySettings) => !c.draft && belowMinimumDuration(c.duration, s.minDuration),
        apply: (): Policy => 'ignore' },
    { rule: RULES.muteDisabled, matches: (c: PolicyContext, _p: Policy, s: PolicySettings) => c.action === 'mute' && !s.muteSegments,
        apply: (): Policy => 'ignore' },
    { rule: RULES.source, matches: (c: PolicyContext) => c.hidden || c.externalSource,
        apply: (): Policy => 'ignore' },
];

export function resolveSegmentPolicy(context: PolicyContext, settings: PolicySettings): Pick<RuleSegment, 'policy' | 'policyTrace'> {
    let policy = context.categoryPolicy;
    const policyTrace = [];
    for (const rule of policyRules) {
        if (!rule.matches(context, policy, settings)) continue;
        policy = rule.apply();
        policyTrace.push({ id: context.id, rule: rule.rule, result: policy });
    }
    return { policy, policyTrace };
}

/** First engine stage: turn category defaults and video facts into effective policies. */
export function prepareSegmentPolicies(input: RuleInput): RuleInput {
    const settings = input.policySettings ?? { autoSkipOnMusicVideos: false, manualSkipOnFullVideo: false, muteSegments: true, minDuration: 0 };
    const full = new Set(input.videoFacts?.fullVideoCategories ?? []);
    for (const segment of input.segments) if (segment.action === 'full' && segment.category) full.add(segment.category);
    const music = input.videoFacts?.hasMusic || input.segments.some(segment => segment.category === 'music_offtopic');
    return { ...input, segments: input.segments.map(segment => ({ ...segment, ...resolveSegmentPolicy({
        id: segment.id, categoryPolicy: segment.policy, categoryHasFullLabel: full.has(segment.category),
        videoHasMusic: music, action: segment.action, duration: segment.end - segment.start,
        draft: segment.draft, hidden: !!segment.hidden, externalSource: !!segment.externalSource,
    }, settings) })) };
}
