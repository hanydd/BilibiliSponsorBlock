import { migrateSkipRulesRollout, skipRulesBucket, SkipRulesRollout } from '../src/config/skipRulesRollout';

const fresh = (userID = 'user-0') => ({ userID, showNewFeaturePopups: true,
    skipEngineMode: 'legacy' as 'legacy' | 'shadow' | 'rules', skipRulesRollout: 'pending' as SkipRulesRollout });
const keys = new Set<string>();

test('stable allocation uses the 20 percent boundary and does not redraw on reload', () => {
    const buckets = new Set<number>();
    for (let i = 0; i < 2000; i++) {
        const config = fresh(`user-${i}`);
        const bucket = skipRulesBucket(config.userID);
        buckets.add(bucket);
        migrateSkipRulesRollout(config, keys);
        expect(config.skipEngineMode).toBe(bucket < 20 ? 'rules' : 'legacy');
        expect(config.skipRulesRollout).toBe(bucket < 20 ? 'auto' : 'invite');
        const allocated = config.skipRulesRollout;
        config.skipEngineMode = 'legacy'; config.userID = 'another-id';
        migrateSkipRulesRollout(config, keys);
        expect(config.skipEngineMode).toBe('legacy');
        expect(config.skipRulesRollout).toBe(allocated);
    }
    expect(buckets.size).toBe(100);
});

test('users who disabled feature announcements never enter rollout, even if later enabled', () => {
    const config = { ...fresh(), showNewFeaturePopups: false };
    migrateSkipRulesRollout(config, keys);
    expect(config).toMatchObject({ skipEngineMode: 'legacy', skipRulesRollout: 'excluded' });
    config.showNewFeaturePopups = true;
    migrateSkipRulesRollout(config, keys);
    expect(config.skipEngineMode).toBe('legacy');
});

test.each(['legacy', 'rules', 'shadow'] as const)('preserves an existing explicit %s selection', mode => {
    const config = { ...fresh(), skipEngineMode: mode };
    migrateSkipRulesRollout(config, new Set(['skipEngineMode']));
    expect(config).toMatchObject({ skipEngineMode: mode, skipRulesRollout: 'existing' });
});

test('waits for a fresh install user ID instead of randomly allocating each context', () => {
    const config = fresh(null);
    migrateSkipRulesRollout(config, keys);
    expect(config.skipRulesRollout).toBe('pending');
    config.userID = 'user-1';
    migrateSkipRulesRollout(config, keys);
    expect(config.skipRulesRollout).not.toBe('pending');
});
