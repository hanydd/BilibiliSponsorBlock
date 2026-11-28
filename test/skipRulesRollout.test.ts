import { migrateSkipRulesRollout, skipRulesBucket, SkipRulesRollout, SkipRulesNotice } from '../src/config/skipRulesRollout';

const fresh = (userID = 'user-0') => ({ userID, showNewFeaturePopups: true,
    skipEngineMode: 'legacy' as 'legacy' | 'shadow' | 'rules', skipRulesRollout: 'pending' as SkipRulesRollout,
    skipRulesNotice: 'unseen' as SkipRulesNotice });
const keys = new Set<string>();
const savedKeys = new Set(['skipEngineMode', 'skipRulesRollout']);
const userInBucket = (bucket: number) => Array.from({ length: 10000 }, (_, i) => `user-${i}`)
    .find(id => skipRulesBucket(id) === bucket)!;
const invited = (bucket = 20) => ({ ...fresh(userInBucket(bucket)), skipRulesRollout: 'invite' as SkipRulesRollout });

test('the release default enables every bucket and keeps later opt-outs on reload', () => {
    const buckets = new Set<number>();
    for (let i = 0; i < 2000; i++) {
        const config = fresh(`user-${i}`);
        const bucket = skipRulesBucket(config.userID);
        buckets.add(bucket);
        migrateSkipRulesRollout(config, keys);
        expect(config).toMatchObject({ skipEngineMode: 'rules', skipRulesRollout: 'auto' });
        config.skipEngineMode = 'legacy';
        migrateSkipRulesRollout(config, savedKeys);
        expect(config).toMatchObject({ skipEngineMode: 'legacy', skipRulesRollout: 'auto' });
    }
    expect(buckets.size).toBe(100);
});

test.each(['pending', 'invite'] as const)('upgrades from an older release use the current target for %s users', state => {
    for (const bucket of [0, 19, 20, 39, 40, 59, 60, 99]) {
        const config = { ...fresh(userInBucket(bucket)), skipRulesRollout: state };
        // Before 0.16.0 neither the engine preference nor allocation was stored.
        migrateSkipRulesRollout(config, state === 'pending' ? new Set(['userID', 'showNewFeaturePopups']) : savedKeys);
        expect(config).toMatchObject({ skipEngineMode: 'rules', skipRulesRollout: 'auto' });
    }
});

test.each([0, 20, 40, 60, 80, 100])('both new and previously unselected users follow the configured %i percent target', percent => {
    for (const bucket of [0, 19, 20, 39, 40, 59, 60, 79, 80, 99]) {
        for (const config of [fresh(userInBucket(bucket)), invited(bucket)]) {
            migrateSkipRulesRollout(config, config.skipRulesRollout === 'pending' ? keys : savedKeys, percent);
            expect(config).toMatchObject({ skipEngineMode: bucket < percent ? 'rules' : 'legacy',
                skipRulesRollout: bucket < percent ? 'auto' : 'invite' });
        }
    }
});

test.each([[40, 60], [40, 80], [20, 100], [0, 40]])('increasing the target from %i to %i enrolls the remaining matching users', (previous, target) => {
    for (const bucket of [0, 19, 20, 39, 40, 59, 60, 79, 80, 99]) {
        const config = fresh(userInBucket(bucket));
        migrateSkipRulesRollout(config, keys, previous);
        migrateSkipRulesRollout(config, savedKeys, target);
        expect(config).toMatchObject({ skipEngineMode: bucket < target ? 'rules' : 'legacy',
            skipRulesRollout: bucket < target ? 'auto' : 'invite' });
    }
});

test.each(['auto', 'existing'] as const)('the release preserves %s opt-outs and manual selections', allocation => {
    const config = { ...invited(59), skipRulesRollout: allocation };
    migrateSkipRulesRollout(config, savedKeys, 60);
    migrateSkipRulesRollout(config, savedKeys, 100);
    expect(config).toMatchObject({ skipEngineMode: 'legacy', skipRulesRollout: allocation });
});

test.each(['pending', 'invite', 'excluded'] as const)('the release enables %s users who only hid announcements, even without a user ID', state => {
    const config = { ...fresh(null), skipRulesRollout: state, showNewFeaturePopups: false };
    migrateSkipRulesRollout(config, state === 'pending' ? keys : savedKeys);
    expect(config).toMatchObject({ skipEngineMode: 'rules', skipRulesRollout: 'auto',
        skipRulesNotice: 'unseen', showNewFeaturePopups: false });
});

describe.each(['invite', 'excluded'] as const)('previous %s users', allocation => {
    test.each(['invitation-dismissed', 'welcome-dismissed'] as const)('keep the old engine after %s', notice => {
        const config = { ...invited(), skipRulesRollout: allocation, skipRulesNotice: notice, showNewFeaturePopups: false };
        migrateSkipRulesRollout(config, savedKeys);
        expect(config).toMatchObject({ skipEngineMode: 'legacy', skipRulesRollout: 'excluded', skipRulesNotice: notice });
    });
});

test.each(['rules', 'shadow'] as const)('leaves an invited manual %s selection untouched', mode => {
    const config = { ...invited(), skipEngineMode: mode };
    migrateSkipRulesRollout(config, savedKeys);
    expect(config).toMatchObject({ skipEngineMode: mode, skipRulesRollout: 'invite' });
});

test.each(['legacy', 'rules', 'shadow'] as const)('preserves an existing explicit %s selection without rollout metadata', mode => {
    const config = { ...fresh(), skipEngineMode: mode };
    migrateSkipRulesRollout(config, new Set(['skipEngineMode']));
    expect(config).toMatchObject({ skipEngineMode: mode, skipRulesRollout: 'existing' });
});

test('reducing the target does not disable previously enabled users', () => {
    const config = fresh(userInBucket(59));
    migrateSkipRulesRollout(config, keys, 60);
    migrateSkipRulesRollout(config, savedKeys, 20);
    expect(config).toMatchObject({ skipEngineMode: 'rules', skipRulesRollout: 'auto' });
});

test.each(['pending', 'invite'] as const)('a partial rollout waits for a user ID before evaluating %s users', state => {
    const config = { ...fresh(null), skipRulesRollout: state };
    const initialKeys = state === 'pending' ? keys : savedKeys;
    migrateSkipRulesRollout(config, initialKeys, 60);
    expect(config).toMatchObject({ skipEngineMode: 'legacy', skipRulesRollout: state });
    config.userID = userInBucket(39);
    migrateSkipRulesRollout(config, initialKeys, 60);
    expect(config).toMatchObject({ skipEngineMode: 'rules', skipRulesRollout: 'auto' });
});

test.each([-1, 101, 40.5, NaN])('rejects invalid rollout configuration %s without changing user settings', percent => {
    const config = fresh();
    expect(() => migrateSkipRulesRollout(config, keys, percent)).toThrow('Invalid skip rules rollout percentage');
    expect(config).toEqual(fresh());
});
