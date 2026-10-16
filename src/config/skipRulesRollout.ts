export const DEFAULT_ROLLOUT_PERCENT = 40;

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
    if (config.skipRulesRollout !== 'pending' && config.skipRulesRollout !== 'invite') return;
    if (config.skipRulesRollout === 'pending' && initialSyncKeys.has('skipEngineMode')) {
        config.skipRulesRollout = 'existing';
        return;
    }
    if (config.skipEngineMode !== 'legacy') return;
    if (!config.showNewFeaturePopups || config.skipRulesNotice !== 'unseen') {
        config.skipRulesRollout = 'excluded';
        return;
    }
    // A fresh install may not have its user ID yet. Defer to the next configuration load.
    if (!config.userID) return;
    if (skipRulesBucket(config.userID) < rolloutPercent) {
        config.skipEngineMode = 'rules';
        config.skipRulesRollout = 'auto';
    } else if (config.skipRulesRollout === 'pending') {
        config.skipRulesRollout = 'invite';
    }
}
