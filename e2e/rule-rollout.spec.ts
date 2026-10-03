import { writeFile } from 'fs/promises';
import { test, expect } from './fixtures/extension';
import { skipRulesBucket } from '../src/config/skipRulesRollout';
import { readSyncStorage, writeSyncStorage } from './support/extensionStorage';

const userFor = (automatic: boolean) => Array.from({ length: 1000 }, (_, i) => `rollout-${i}`).find(id => (skipRulesBucket(id) < 20) === automatic)!;
async function upgrade(worker, automatic: boolean, announcements = true) {
    await writeSyncStorage(worker, { userID: userFor(automatic), showNewFeaturePopups: announcements,
        categorySelections: [{ name: 'sponsor', option: 1 }], speedUpPlaybackRate: 3 });
    await worker.evaluate(async () => chrome.storage.sync.remove(['skipEngineMode', 'skipRulesRollout', 'skipRulesNotice']));
}
const options = (id: string) => `chrome-extension://${id}/options/options.html#behavior`;

test('automatic cohort gets a welcome once and can opt out without losing preferences', async ({ extensionPage: page, extensionId, extensionServiceWorker: worker }) => {
    await upgrade(worker, true);
    await page.goto(options(extensionId));
    const dialog = page.locator('#rules-welcome');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('20%');
    await expect.poll(() => readSyncStorage(worker, 'skipRulesRollout')).toBe('auto');
    await expect.poll(() => readSyncStorage(worker, 'skipEngineMode')).toBe('rules');
    await expect(page.locator('#rules-invitation')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect.poll(() => readSyncStorage(worker, 'skipRulesNotice')).toBe('welcome-dismissed');
    await page.reload();
    await expect(dialog).toBeHidden();
    await page.locator('#rule-engine-disable').click();
    await expect(page.locator('#classic-behavior')).toBeVisible();
    await expect(page.locator('#behavior #rule-engine-enabled')).toHaveCount(0);
    await expect.poll(() => readSyncStorage(worker, 'skipEngineMode')).toBe('legacy');
    await page.reload();
    await expect(page.locator('#classic-behavior')).toBeVisible();
    await expect(page.locator('#rules-invitation')).toBeHidden();
    await expect(page.locator('#sponsorSkipOption select')).toHaveValue('manualSkip');
    expect(await readSyncStorage(worker, 'speedUpPlaybackRate')).toBe(3);
});

test('invited cohort opts in from a non-blocking bubble and can return from the welcome', async ({ extensionPage: page, extensionId, extensionServiceWorker: worker }) => {
    await upgrade(worker, false);
    await page.goto(options(extensionId));
    await expect(page.locator('#rules-invitation')).toBeVisible();
    await expect(page.locator('#rules-welcome')).toBeHidden();
    await expect(page.locator('#classic-behavior')).toBeVisible();
    await expect.poll(() => readSyncStorage(worker, 'skipRulesRollout')).toBe('invite');
    await page.locator('#rules-invitation-enable').click();
    await expect(page.locator('#rules-welcome')).toBeVisible();
    await expect(page.locator('#rules-welcome-auto')).toBeHidden();
    await expect(page.locator('#rules-invitation')).toBeHidden();
    await expect.poll(() => readSyncStorage(worker, 'skipEngineMode')).toBe('rules');
    await page.locator('#rules-welcome-classic').click();
    await expect(page.locator('#classic-behavior')).toBeVisible();
    await expect.poll(() => readSyncStorage(worker, 'skipEngineMode')).toBe('legacy');
    await page.reload();
    await expect(page.locator('#rules-invitation')).toBeHidden();
});

test('dismissed invitation stays dismissed but manual opt-in remains in experiments', async ({ extensionContext, extensionPage: page, extensionId, extensionServiceWorker: worker }) => {
    await upgrade(worker, false);
    await page.goto(options(extensionId));
    await page.locator('#rules-invitation-close').click();
    await expect.poll(() => readSyncStorage(worker, 'skipRulesNotice')).toBe('invitation-dismissed');
    await page.reload();
    await expect(page.locator('#rules-invitation')).toBeHidden();
    await page.locator('[data-for="experiment"]').click();
    await expect(page.locator('#rule-engine-entry')).toBeVisible();
    await page.locator('label[for="rule-engine-enabled"]').click();
    await expect(page.locator('#rules-welcome')).toBeVisible();
    const other = await extensionContext.newPage();
    await other.goto(options(extensionId));
    await expect(other.locator('#rule-engine-disable')).toBeVisible();
    await other.locator('#rule-engine-disable').click();
    await expect(page.locator('#rules-welcome')).toBeHidden();
    await expect(page.locator('#rule-engine-enabled')).not.toBeChecked();
    await other.close();
});

test('disabled announcements prevent enrollment and prompts but allow intentional opt-in', async ({ extensionPage: page, extensionId, extensionServiceWorker: worker }) => {
    await upgrade(worker, true, false);
    await page.goto(options(extensionId));
    await expect.poll(() => readSyncStorage(worker, 'skipRulesRollout')).toBe('excluded');
    await expect(page.locator('#classic-behavior')).toBeVisible();
    await expect(page.locator('#rules-invitation')).toBeHidden();
    await expect(page.locator('#rules-welcome')).toBeHidden();
    await page.locator('[data-for="experiment"]').click();
    await page.locator('label[for="rule-engine-enabled"]').click();
    await expect.poll(() => readSyncStorage(worker, 'skipEngineMode')).toBe('rules');
    await expect(page.locator('#rules-welcome')).toBeHidden();
    await page.locator('[data-for="behavior"]').click();
    await expect(page.locator('#skip-rules')).toBeVisible();
});

test('turning off feature announcements immediately hides the invitation in another window', async ({ extensionPage: page, extensionId, extensionServiceWorker: worker }) => {
    await upgrade(worker, false);
    await page.goto(options(extensionId));
    await expect(page.locator('#rules-invitation')).toBeVisible();
    await writeSyncStorage(worker, { showNewFeaturePopups: false });
    await expect(page.locator('#rules-invitation')).toBeHidden();
    await page.reload();
    await expect(page.locator('#rules-invitation')).toBeHidden();
    await expect(page.locator('#classic-behavior')).toBeVisible();
});

test('an existing classic preference can receive an invitation without being automatically switched', async ({ extensionPage: page, extensionId, extensionServiceWorker: worker }) => {
    await writeSyncStorage(worker, { skipEngineMode: 'legacy', skipRulesNotice: 'unseen', showNewFeaturePopups: true });
    await worker.evaluate(async () => chrome.storage.sync.remove('skipRulesRollout'));
    await page.goto(options(extensionId));
    await expect.poll(() => readSyncStorage(worker, 'skipRulesRollout')).toBe('existing');
    await expect(page.locator('#classic-behavior')).toBeVisible();
    await expect(page.locator('#rules-invitation')).toBeVisible();
    expect(await readSyncStorage(worker, 'skipEngineMode')).toBe('legacy');
    await page.locator('#rules-invitation-dismiss').click();
    await expect.poll(() => readSyncStorage(worker, 'skipRulesNotice')).toBe('welcome-dismissed');
    await page.reload();
    await expect(page.locator('#rules-invitation')).toBeHidden();
});

test('not interested suppresses all onboarding after reload and a later intentional opt-in', async ({ extensionContext, extensionPage: page, extensionId, extensionServiceWorker: worker }) => {
    await upgrade(worker, false);
    await page.goto(options(extensionId));
    await page.locator('#rules-invitation-dismiss').click();
    await expect(page.locator('#rules-invitation')).toBeHidden();
    await expect.poll(() => readSyncStorage(worker, 'skipRulesNotice')).toBe('welcome-dismissed');
    await page.reload();
    await expect(page.locator('#rules-invitation')).toBeHidden();
    await page.locator('[data-for="experiment"]').click();
    await page.locator('label[for="rule-engine-enabled"]').click();
    await expect.poll(() => readSyncStorage(worker, 'skipEngineMode')).toBe('rules');
    await expect(page.locator('#rules-welcome')).toBeHidden();
    const other = await extensionContext.newPage();
    await other.goto(options(extensionId));
    await expect(other.locator('#skip-rules')).toBeVisible();
    await expect(other.locator('#rules-welcome')).toBeHidden();
    await other.close();
});

for (const darkMode of [true, false]) test(`onboarding fits narrow and wide settings pages in ${darkMode ? 'dark' : 'light'} mode`, async ({ extensionPage: page, extensionId, extensionServiceWorker: worker }, testInfo) => {
    await writeSyncStorage(worker, { darkMode });
    for (const automatic of [true, false]) {
        await page.goto('about:blank');
        await upgrade(worker, automatic);
        await page.goto(options(extensionId));
        const panel = page.locator(automatic ? '#rules-welcome' : '#rules-invitation');
        await expect(panel).toBeVisible();
        for (const width of [720, 1080, 1920]) {
            await page.setViewportSize({ width, height: 800 });
            const bounds = await panel.boundingBox();
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
            expect(bounds.y + bounds.height).toBeLessThanOrEqual(800);
            expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        }
        // Rendered DOM artifacts let reviewers inspect the actual UI without extension APIs.
        const name = automatic ? 'welcome.html' : 'invitation.html';
        const path = testInfo.outputPath(name);
        await writeFile(path, await page.content());
        await testInfo.attach(name, { path, contentType: 'text/html' });
    }
});
