export const DEFAULT_ROLLOUT_PERCENT = 100;

export type SkipRulesRollout = 'pending' | 'auto' | 'invite' | 'excluded' | 'existing';
export type SkipRulesNotice = 'unseen' | 'invitation-dismissed' | 'welcome-dismissed';

interface RolloutConfig {
    userID: string;
    showNewFeaturePopups: boolean;
    skipEngineMode: 'legacy' | 'shadow' | 'rules';
    skipRulesRollout: SkipRulesRollout;
    skipRulesNotice: SkipRulesNotice;
}

/** The same user always falls into the same cohort across contexts and devices. */
export function skipRulesBucket(userID: string): number {
    let hash = 2166136261;
    for (const char of `skip-rules-v1:${userID}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return (hash >>> 0) % 100;
}

export function migrateSkipRulesRollout(
    config: RolloutConfig,
    initialSyncKeys: ReadonlySet<string>,
    rolloutPercent = DEFAULT_ROLLOUT_PERCENT
): void {
    if (!Number.isInteger(rolloutPercent) || rolloutPercent < 0 || rolloutPercent > 100) {
        throw new Error('Invalid skip rules rollout percentage');
    }
    const fullRelease = rolloutPercent === 100;
    // Older versions also excluded users who only hid feature announcements.
    const excludedByAnnouncements = config.skipRulesRollout === 'excluded' && config.skipRulesNotice === 'unseen';
    if (config.skipRulesRollout !== 'pending' && config.skipRulesRollout !== 'invite'
        && !(fullRelease && excludedByAnnouncements)) return;
    if (config.skipRulesRollout === 'pending' && initialSyncKeys.has('skipEngineMode')) {
        config.skipRulesRollout = 'existing';
        return;
    }
    if (config.skipEngineMode !== 'legacy') return;
    if (config.skipRulesNotice !== 'unseen' || (!fullRelease && !config.showNewFeaturePopups)) {
        config.skipRulesRollout = 'excluded';
        return;
    }
    if (!fullRelease && !config.userID) return;
    if (fullRelease || skipRulesBucket(config.userID) < rolloutPercent) {
        config.skipEngineMode = 'rules';
        config.skipRulesRollout = 'auto';
    } else if (config.skipRulesRollout === 'pending') {
        config.skipRulesRollout = 'invite';
    }
}
