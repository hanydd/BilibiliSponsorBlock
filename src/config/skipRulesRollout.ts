export type SkipRulesRollout = 'pending' | 'auto' | 'invite' | 'excluded' | 'existing';
export type SkipRulesNotice = 'unseen' | 'invitation-dismissed' | 'welcome-dismissed';

interface RolloutConfig {
    userID: string;
    showNewFeaturePopups: boolean;
    skipEngineMode: 'legacy' | 'shadow' | 'rules';
    skipRulesRollout: SkipRulesRollout;
}

/** Stable across extension contexts and devices; changing IDs never redraws a completed allocation. */
export function skipRulesBucket(userID: string): number {
    let hash = 2166136261;
    for (const char of `skip-rules-v1:${userID}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return (hash >>> 0) % 100;
}

export function migrateSkipRulesRollout(config: RolloutConfig, initialSyncKeys: ReadonlySet<string>): void {
    if (config.skipRulesRollout !== 'pending') return;
    if (initialSyncKeys.has('skipEngineMode')) {
        config.skipRulesRollout = 'existing';
    } else if (!config.showNewFeaturePopups) {
        config.skipRulesRollout = 'excluded';
    } else if (config.userID) {
        const enabled = skipRulesBucket(config.userID) < 20;
        if (enabled) config.skipEngineMode = 'rules';
        config.skipRulesRollout = enabled ? 'auto' : 'invite';
    }
    // A fresh install may not have its user ID yet. Defer to the next configuration load.
}
