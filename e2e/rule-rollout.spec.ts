import { toggleRuleEngine } from './support/ruleEngine';
import { test, expect } from './fixtures/extension';
import { skipRulesBucket } from '../src/config/skipRulesRollout';
import { readSyncStorage, writeSyncStorage } from './support/extensionStorage';

const previouslyInvitedUser = Array.from({ length: 1000 }, (_, i) => `rollout-${i}`)
    .find(id => skipRulesBucket(id) === 99)!;

const options = (id: string) => `chrome-extension://${id}/options/options.html#behavior`;

test('a user outside the old 60 percent cohort upgrades silently and can opt out', async ({ extensionPage: page, extensionId, extensionServiceWorker: worker }) => {
    await writeSyncStorage(worker, { userID: previouslyInvitedUser, showNewFeaturePopups: true, skipEngineMode: 'legacy',
        skipRulesRollout: 'invite', skipRulesNotice: 'unseen',
        categorySelections: [{ name: 'sponsor', option: 1 }], speedUpPlaybackRate: 3 });
    await page.goto(options(extensionId));
    await expect(page.locator('#skip-rules')).toBeVisible();
    await expect(page.locator('#rules-welcome, #rules-invitation')).toHaveCount(0);
    await expect.poll(() => readSyncStorage(worker, 'skipRulesRollout')).toBe('auto');
    await expect.poll(() => readSyncStorage(worker, 'skipEngineMode')).toBe('rules');
    await toggleRuleEngine(page);
    await expect(page.locator('#classic-behavior')).toBeVisible();
    await expect(page.locator('#behavior #legacy-engine-enabled')).toHaveCount(0);
    await expect.poll(() => readSyncStorage(worker, 'skipRulesRollout')).toBe('existing');
    await expect.poll(() => readSyncStorage(worker, 'skipEngineMode')).toBe('legacy');
    await page.reload();
    await expect(page.locator('#classic-behavior')).toBeVisible();
    await expect(page.locator('#sponsorSkipOption select')).toHaveValue('manualSkip');
    expect(await readSyncStorage(worker, 'speedUpPlaybackRate')).toBe(3);
});

for (const notice of ['invitation-dismissed', 'welcome-dismissed']) test(`a previously dismissed ${notice} invitation stays off inside the expanded cohort`, async ({ extensionPage: page, extensionId, extensionServiceWorker: worker }) => {
    await writeSyncStorage(worker, { userID: previouslyInvitedUser, showNewFeaturePopups: true, skipEngineMode: 'legacy',
        skipRulesRollout: 'invite', skipRulesNotice: notice });
    await page.goto(options(extensionId));
    await expect.poll(() => readSyncStorage(worker, 'skipRulesRollout')).toBe('excluded');
    await expect(page.locator('#classic-behavior')).toBeVisible();
    await expect(page.locator('#rules-welcome, #rules-invitation')).toHaveCount(0);
    expect(await readSyncStorage(worker, 'skipEngineMode')).toBe('legacy');
});

test('enables the new engine before a fresh install receives a user ID', async ({ extensionPage: page, extensionId, extensionServiceWorker: worker }) => {
    await writeSyncStorage(worker, { userID: null, showNewFeaturePopups: true });
    await worker.evaluate(() => chrome.storage.sync.remove(['skipEngineMode', 'skipRulesRollout', 'skipRulesNotice']));
    await page.goto(options(extensionId));
    await expect(page.locator('#skip-rules')).toBeVisible();
    await expect(page.locator('#rules-welcome, #rules-invitation')).toHaveCount(0);
    await expect.poll(() => readSyncStorage(worker, 'skipEngineMode')).toBe('rules');
    await page.locator('[data-for="experiment"]').click();
    await expect(page.locator('#rule-engine-entry')).toBeVisible();
});

test('users excluded only by hidden announcements upgrade silently', async ({ extensionPage: page, extensionId, extensionServiceWorker: worker }) => {
    await writeSyncStorage(worker, { userID: previouslyInvitedUser, showNewFeaturePopups: false, skipEngineMode: 'legacy',
        skipRulesRollout: 'excluded', skipRulesNotice: 'unseen' });
    await page.goto(options(extensionId));
    await expect(page.locator('#skip-rules')).toBeVisible();
    await expect(page.locator('#rules-welcome, #rules-invitation')).toHaveCount(0);
    await expect.poll(() => readSyncStorage(worker, 'skipRulesRollout')).toBe('auto');
    await expect.poll(() => readSyncStorage(worker, 'skipEngineMode')).toBe('rules');
    expect(await readSyncStorage(worker, 'showNewFeaturePopups')).toBe(false);
});

test('an explicit old-engine preference stays in place and can be changed manually', async ({ extensionContext, extensionPage: page, extensionId, extensionServiceWorker: worker }) => {
    await writeSyncStorage(worker, { userID: previouslyInvitedUser, skipEngineMode: 'legacy',
        skipRulesNotice: 'unseen', showNewFeaturePopups: true });
    await worker.evaluate(async () => chrome.storage.sync.remove('skipRulesRollout'));
    await page.goto(options(extensionId));
    await expect.poll(() => readSyncStorage(worker, 'skipRulesRollout')).toBe('existing');
    await expect(page.locator('#classic-behavior')).toBeVisible();
    await expect(page.locator('#rules-welcome, #rules-invitation')).toHaveCount(0);
    await toggleRuleEngine(page);
    await expect(page.locator('#skip-rules')).toBeVisible();
    await expect(page.locator('#rules-welcome, #rules-invitation')).toHaveCount(0);
    const other = await extensionContext.newPage();
    await other.goto(options(extensionId));
    await expect(other.locator('#skip-rules')).toBeVisible();
    await toggleRuleEngine(other);
    await expect(page.locator('#classic-behavior')).toBeVisible();
    await other.close();
});

test('restoring defaults re-enables the new engine without creating a manual selection', async ({ extensionPage: page, extensionId, extensionServiceWorker: worker }) => {
    await page.goto(options(extensionId));
    await expect(page.locator('#classic-behavior')).toBeVisible();
    await page.locator('[data-for="import"]').click();
    page.once('dialog', dialog => dialog.accept());
    await Promise.all([
        page.waitForEvent('load'),
        page.locator('[data-sync="resetToDefault"] .trigger-button').click(),
    ]);

    await expect.poll(() => readSyncStorage(worker, 'skipEngineMode')).toBe('rules');
    await expect.poll(() => readSyncStorage(worker, 'skipRulesRollout')).toBe('auto');
    await page.locator('[data-for="behavior"]').click();
    await expect(page.locator('#skip-rules')).toBeVisible();
    await expect(page.locator('#legacy-engine-enabled')).not.toBeChecked();
});
