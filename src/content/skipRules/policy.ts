import type Config from '../../config';
import { RULES } from './rules';
import type { Policy, RuleSegment } from './types';

type PolicySettings = Pick<typeof Config.config, 'autoSkipOnMusicVideos' | 'manualSkipOnFullVideo' | 'muteSegments'>;
export interface PolicyContext {
    id: string;
    categoryPolicy: Policy;
    action: RuleSegment['action'];
    videoHasMusic: boolean;
    categoryHasFullLabel: boolean;
    hidden: boolean;
    externalSource: boolean;
}

/** Preserve the existing override order, while keeping its reasons with the segment. */
const policyRules = [
    { rule: RULES.music, matches: (c: PolicyContext, p: Policy, s: PolicySettings) => s.autoSkipOnMusicVideos && c.videoHasMusic && c.action === 'skip' && p !== 'ignore',
        apply: (): Policy => 'auto' },
    { rule: RULES.fullVideo, matches: (c: PolicyContext, p: Policy, s: PolicySettings) => s.manualSkipOnFullVideo && c.categoryHasFullLabel && p === 'auto',
        apply: (): Policy => 'manual' },
    { rule: RULES.source, matches: (c: PolicyContext, _p: Policy, s: PolicySettings) => c.hidden || c.externalSource || (c.action === 'mute' && !s.muteSegments),
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
