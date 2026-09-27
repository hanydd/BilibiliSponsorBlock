import { test, expect } from './fixtures/extension';
import { readSyncStorage, writeSyncStorage } from './support/extensionStorage';

const rules = '#skip-rules';
async function open(page, extensionId: string, tab = 'segments') {
    await page.goto(`chrome-extension://${extensionId}/options/options.html?rulesTab=${tab}#skip-rules`);
    if (!await page.locator('#rule-engine-enabled').isChecked()) await page.locator('label[for="rule-engine-enabled"]').click();
    await expect(page.locator('#skip-rules')).toBeVisible();
    await expect(page.locator('#rules-tab-' + tab)).toHaveAttribute('aria-selected', 'true');
}

test('one rollout switch controls both views and engines across reloads and settings windows', async ({ extensionContext, extensionPage: page, extensionId, extensionServiceWorker }) => {
    await page.goto(`chrome-extension://${extensionId}/options/options.html#behavior`);
    await expect(page.locator('#rule-engine-enabled')).not.toBeChecked();
    await expect(page.locator('#classic-behavior')).toBeVisible();
    await expect(page.locator(rules)).toBeHidden();
    await expect(page.locator('#rule-engine-enabled')).toHaveCount(1);
    await expect(page.locator('#skipEngineMode, .options-view-switch, [data-for="skip-rules"]')).toHaveCount(0);
    await page.locator('label[for="rule-engine-enabled"]').click();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'skipEngineMode')).toBe('rules');
    await expect(page.locator(rules)).toBeVisible();
    await expect(page.locator('#classic-behavior')).toBeHidden();
    await expect(page.locator('.rules-tabs [role="tab"]')).toHaveCount(4);
    await page.locator('#rules-tab-matrix').click();
    await expect(page.locator('#rule-engine-entry')).toBeVisible();
    await page.reload();
    await expect(page.locator('#rule-engine-enabled')).toBeChecked();
    await expect(page.locator('#rules-tab-matrix')).toHaveAttribute('aria-selected', 'true');
    await page.locator('[data-for="interface"]').click();
    await page.locator('[data-for="behavior"]').click();
    await expect(page.locator(rules)).toBeVisible();
    expect(await readSyncStorage(extensionServiceWorker, 'skipEngineMode')).toBe('rules');
    const other = await extensionContext.newPage();
    await other.goto(`chrome-extension://${extensionId}/options/options.html#behavior`);
    await expect(other.locator('#rule-engine-enabled')).toBeChecked();
    await other.locator('label[for="rule-engine-enabled"]').click();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'skipEngineMode')).toBe('legacy');
    await expect(page.locator('#rule-engine-enabled')).not.toBeChecked();
    await expect(page.locator('#classic-behavior')).toBeVisible();
    await expect(page.locator(rules)).toBeHidden();
    await page.goto(`chrome-extension://${extensionId}/options/options.html#skip-rules`);
    await expect(page).toHaveURL(/#behavior$/);
    await expect(page.locator('#classic-behavior')).toBeVisible();
    await expect(page.locator('#rule-engine-enabled')).not.toBeChecked();
    expect(await readSyncStorage(extensionServiceWorker, 'skipEngineMode')).toBe('legacy');
    await other.close();
});

test('segment tab reuses category controls including both colors and restores them to behavior', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await open(page, extensionId);
    await expect(page.locator(`${rules} #sponsorSkipOption select`)).toBeVisible();
    await expect(page.locator('#sponsorSkipOption')).toHaveCount(1);
    await page.locator('#sponsorSkipOption select').selectOption('manualSkip');
    await expect.poll(async () => (await readSyncStorage<Array<{ name: string; option: number }>>(extensionServiceWorker, 'categorySelections')).find(s => s.name === 'sponsor')?.option).toBe(1);
    await page.locator('#sponsorColorOption input').fill('#123456');
    await page.locator('#sponsorPreviewColorOption input').fill('#654321');
    await expect.poll(async () => (await readSyncStorage<Record<string, { color: string }>>(extensionServiceWorker, 'barTypes'))?.sponsor?.color).toBe('#123456');
    await expect.poll(async () => (await readSyncStorage<Record<string, { color: string }>>(extensionServiceWorker, 'barTypes'))?.['preview-sponsor']?.color).toBe('#654321');
    await page.locator('label[for="rule-engine-enabled"]').click();
    await expect(page.locator('#category-home #sponsorSkipOption select')).toHaveValue('manualSkip');
    await expect(page.locator('#category-home #sponsorColorOption input')).toHaveValue('#123456');
    await page.locator('label[for="rule-engine-enabled"]').click();
    await expect(page.locator(`${rules} #sponsorSkipOption select`)).toHaveValue('manualSkip');
    await page.reload();
    await expect(page.locator(`${rules} #sponsorPreviewColorOption input`)).toHaveValue('#654321');
});

test('matrix uses real saved settings and supports rule detail navigation', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await open(page, extensionId);
    await page.locator('[data-rule-setting="skipOnSeekToSegment"]').selectOption('true');
    await page.locator('#rules-tab-matrix').click();
    await page.locator('[data-state="ready"][data-operation="front"]').click();
    await expect(page.locator('.rules-result dd').first()).toContainText('20');
    await page.locator('#rules-tab-segments').click();
    await page.locator('[data-rule-setting="skipOnSeekToSegment"]').selectOption('false');
    await page.locator('#rules-tab-matrix').click();
    await expect(page.locator('.rules-result dd').first()).not.toContainText('20');
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'skipOnSeekToSegment')).toBe(false);
    await page.locator('.rules-result .rules-trace button').first().click();
    await expect(page.locator('#rules-tab-rules')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.rules-description h3')).not.toBeEmpty();
    await page.locator('.rules-description > .rules-link').click();
    await expect(page.locator('#rules-tab-matrix')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-state="ready"][data-operation="front"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#rules-tab-segments').click();
    await page.locator('[data-rule-setting="skipResumeAction"]').selectOption('manual');
    await page.locator('[data-rule-setting="advanceSkipNotice"]').check();
    await page.locator('[data-for="interface"]').click();
    await expect(page.locator('[data-sync="skipNoticeDurationBefore"]')).toBeVisible();
    await page.locator('[data-for="behavior"]').click();
    await expect(page.locator('[data-rule-setting="skipResumeAction"]')).toHaveValue('manual');
    await expect(page.locator('#skipOnSeekToSegment')).not.toBeChecked();
});

test('simulation preserves configured resume behavior and never saves preset policies', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await writeSyncStorage(extensionServiceWorker, { skipResumeAction: 'manual', speedUpResumeAction: 'manual', speedUpPlaybackRate: 4 });
    const before = await readSyncStorage(extensionServiceWorker, 'categorySelections');
    const beforeSpeed = await readSyncStorage(extensionServiceWorker, 'enableSpeedUp');
    await open(page, extensionId, 'simulator');
    const panel = page.locator('#rules-panel-simulator');
    await panel.locator('.rules-sim-controls select').first().selectOption('pause');
    await panel.getByRole('button', { name: '载入场景', exact: true }).click();
    await panel.getByRole('button', { name: '恢复播放', exact: true }).click();
    await expect(panel.locator('[data-rules-time]')).toHaveText('15s');
    const firstCard = panel.locator('[data-card="A"]');
    await firstCard.evaluate(node => { (window as unknown as { savedCard: Element }).savedCard = node; });
    await firstCard.locator('[data-card-action="skip"]').click();
    await expect(panel.locator('[data-rules-time]')).toHaveText('20s');
    expect(await firstCard.evaluate(node => node === (window as unknown as { savedCard: Element }).savedCard)).toBe(true);
    await panel.locator('.rules-sim-controls select').first().selectOption('adjacent');
    await panel.getByRole('button', { name: '载入场景', exact: true }).click();
    await expect(panel.locator('[data-card]')).toHaveCount(2);
    await expect(panel.locator('[data-card="B"]')).toContainText('正在快进');
    expect(await readSyncStorage(extensionServiceWorker, 'categorySelections')).toEqual(before);
    expect(await readSyncStorage(extensionServiceWorker, 'enableSpeedUp')).toBe(beforeSpeed);
    await page.locator('#rules-tab-segments').click();
    await page.locator('[data-rule-setting="dontShowNotice"]').uncheck();
    await page.locator('#rules-tab-simulator').click();
    await expect(panel.locator('[data-card]')).toHaveCount(0);
    await page.locator('#rules-tab-segments').click();
    await page.locator('[data-rule-setting="dontShowNotice"]').check();
    await page.locator('#rules-tab-simulator').click();
    await expect(panel.locator('[data-card]')).toHaveCount(2);
    await panel.getByRole('button', { name: '连续播放', exact: true }).click();
    await page.waitForTimeout(250);
    await page.locator('#rules-tab-rules').click();
    const time = await panel.locator('[data-rules-time]').textContent();
    await page.waitForTimeout(250);
    expect(await panel.locator('[data-rules-time]').textContent()).toBe(time);
});

test('rule directory search, filter, theme, tab persistence and narrow layouts', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await open(page, extensionId, 'rules');
    await page.locator('.rules-search select').selectOption('fixed');
    await expect(page.locator('.rules-directory')).not.toContainText('对应现有设置');
    await page.locator('.rules-search input').fill('不会存在的规则');
    await expect(page.locator('.rules-directory button')).toHaveCount(0);
    await expect(page.locator('.rules-description')).toContainText('未找到');
    await page.locator('.rules-search input').fill('');
    await page.locator('#rules-tab-rules').focus(); await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#rules-tab-simulator')).toHaveAttribute('aria-selected', 'true');
    await page.reload(); await expect(page.locator('#rules-tab-simulator')).toHaveAttribute('aria-selected', 'true');
    await writeSyncStorage(extensionServiceWorker, { darkMode: false }); await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const tab of ['segments', 'matrix', 'simulator', 'rules']) {
        await page.locator('#rules-tab-' + tab).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    const body = await page.locator(rules).textContent();
    expect(body).not.toMatch(/__MSG_/);
});


test('first tab covers every classic behavior setting and keeps native controls functional', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await page.goto(`chrome-extension://${extensionId}/options/options.html#behavior`);
    await expect(page.locator('#sponsorSkipOption select')).toBeVisible();
    const originalKeys = await page.locator('#classic-behavior [data-sync]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-sync')));
    await page.locator('label[for="rule-engine-enabled"]').click();
    const panel = page.locator('#rules-panel-segments');
    for (const key of originalKeys) {
        await expect(panel.locator(`[data-sync="${key}"], [data-rule-setting="${key}"]`)).toHaveCount(1);
    }
    await expect(page.locator('.rules-settings')).toHaveCount(1);
    await expect(page.locator('#rule-engine-entry')).toBeVisible();
    await panel.locator('label[for="forceChannelCheck"]').click();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'forceChannelCheck')).toBe(true);
    await panel.locator('label[for="audioNotificationOnSkip"]').click();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'audioNotificationOnSkip')).toBe(true);
    await panel.locator('.rules-common-options').last().locator('summary').click();
    const labels = panel.locator('#fullVideoLabelsOnThumbnailsMode');
    await panel.locator('label[for="fullVideoSegments"]').click();
    await expect(labels).toBeHidden();
    await panel.locator('label[for="fullVideoSegments"]').click();
    await expect(labels).toBeVisible();
    page.once('dialog', dialog => dialog.dismiss());
    const previous = await labels.inputValue();
    await labels.selectOption('2');
    await expect(labels).toHaveValue(previous);
    await labels.selectOption('1');
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'fullVideoLabelsOnThumbnailsMode')).toBe(1);
    await panel.locator('label[for="dynamicAndCommentSponsorBlocker"]').click();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'dynamicAndCommentSponsorBlocker')).toBe(true);
    await panel.locator('#dynamicAndCommentSponsorRegexPattern').fill('migration-test');
    await panel.locator('[data-sync="dynamicAndCommentSponsorRegexPattern"] .text-change-set').click();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'dynamicAndCommentSponsorRegexPattern')).toBe('migration-test');
    await page.locator('label[for="rule-engine-enabled"]').click();
    await expect(page.locator('#behavior #audioNotificationOnSkip')).toBeChecked();
    await expect(page.locator('#behavior #dynamicAndCommentSponsorRegexPattern')).toHaveValue('migration-test');
    await expect(page.locator('#behavior #fullVideoLabelsOnThumbnailsMode')).toHaveValue('1');
    await page.locator('label[for="rule-engine-enabled"]').click();
    await page.reload();
    await expect(panel.locator('#audioNotificationOnSkip')).toBeChecked();
    for (const tab of ['matrix', 'simulator', 'rules']) {
        await page.locator('#rules-tab-' + tab).click();
        await expect(page.locator('.rules-settings')).toBeHidden();
        await expect(page.locator('#rule-engine-entry')).toBeVisible();
    }
});

for (const mode of ['legacy', 'rules']) {
    test(`dependent options stay visible after rapid toggles in ${mode} settings`, async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
        await writeSyncStorage(extensionServiceWorker, { skipEngineMode: mode });
        await page.goto(`chrome-extension://${extensionId}/options/options.html#behavior`);
        if (mode === 'rules') await page.locator('.rules-common-options').last().locator('summary').click();
        const checkbox = page.locator('#fullVideoSegments');
        const labels = page.locator('#fullVideoLabelsOnThumbnailsMode');
        await expect(labels).toBeVisible();
        await page.clock.install();
        await page.clock.pauseAt(new Date());

        // Hold the 400 ms collapse timer while changing the setting locally or in another window.
        for (const external of [false, true]) {
            await checkbox.evaluate((node: HTMLInputElement) => node.click());
            await page.clock.runFor(30);
            await expect.poll(() => readSyncStorage(extensionServiceWorker, 'fullVideoSegments')).toBe(false);
            await expect(labels.locator('..')).toHaveClass(/hiding/);
            if (external) await writeSyncStorage(extensionServiceWorker, { fullVideoSegments: true });
            else await checkbox.evaluate((node: HTMLInputElement) => node.click());
            await page.clock.runFor(30);
            await expect(checkbox).toBeChecked();
            await expect.poll(() => readSyncStorage(extensionServiceWorker, 'fullVideoSegments')).toBe(true);
            await expect(labels).toBeVisible();
            await page.clock.runFor(450);
            await expect(labels).toBeVisible();
            await expect(labels.locator('..')).not.toHaveClass(/hiding/);
        }
    });
}

test('migrated whitelist and skip shortcuts retain their editing dialogs', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await writeSyncStorage(extensionServiceWorker, { whitelistedChannels: [{ id: '1001', name: 'Migration Channel' }] });
    await open(page, extensionId);
    const panel = page.locator('#rules-panel-segments');
    await panel.locator('.rules-common-options').nth(0).locator('summary').click();
    const manager = panel.locator('[data-type="react-WhitelistManagerComponent"]');
    await expect(manager).toContainText('Migration Channel');
    page.once('dialog', dialog => dialog.accept());
    await manager.getByRole('row').filter({ hasText: 'Migration Channel' }).locator('.option-button').click();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'whitelistedChannels')).toEqual([]);
    await panel.locator('.rules-common-options').nth(1).locator('summary').click();
    await panel.locator('[data-sync="skipKeybind"] .keybind-buttons').click();
    await expect(page.locator('#keybind-dialog .dialog')).toBeVisible();
    await page.keyboard.press('k');
    await page.locator('#change-keybind-ctrl').check();
    await page.locator('#change-keybind-alt').check();
    await page.locator('#keybind-dialog .save-button').click();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'skipKeybind')).toMatchObject({ key: 'k', code: 'KeyK' });
    await page.locator('[data-for="keybinds"]').click();
    await expect(page.locator('#keybinds [data-sync="skipKeybind"] .keyBase')).toHaveText('K');
});

test('scenario contexts explain first-layer policy overrides using saved settings', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await writeSyncStorage(extensionServiceWorker, { autoSkipOnMusicVideos: true, manualSkipOnFullVideo: true, muteSegments: false, minDuration: 0 });
    await open(page, extensionId, 'matrix');
    await page.locator('[data-rule-mode="manual"]').click();
    await page.locator('[data-example-context]').selectOption('music-full');
    await page.locator('[data-state="ready"][data-operation="natural"]').click();
    await expect(page.locator('.rules-result .rules-trace')).toContainText('音乐');
    await expect(page.locator('.rules-result .rules-trace')).toContainText('全片');
    await expect(page.locator('.rules-result dd').first()).not.toContainText('20');
    await page.locator('[data-example-context]').selectOption('music');
    await expect(page.locator('.rules-result dd').first()).toContainText('20');
    await page.locator('[data-example-context]').selectOption('mute');
    await expect(page.locator('.rules-result .rules-trace')).toContainText('未启用静音片段');
    await page.locator('.rules-result .rules-trace button').filter({ hasText: '未启用静音片段' }).click();
    await expect(page.locator('.rules-description')).toContainText('允许片段静音');
    await page.locator('#rules-tab-segments').click();
    await page.locator('#skip-rules label[for="muteSegments"]').click();
    await page.locator('#rules-tab-matrix').click();
    await page.locator('[data-rule-mode="auto"]').click();
    await expect(page.locator('.rules-result dd').first()).toContainText('静音');
});
