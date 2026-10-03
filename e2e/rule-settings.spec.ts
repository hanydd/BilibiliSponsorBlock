import { toggleRuleEngine } from './support/ruleEngine';
import { categoryList } from '../config.json';
import { test, expect } from './fixtures/extension';
import { readSyncStorage, writeSyncStorage } from './support/extensionStorage';
import { ruleDefinitions } from '../src/content/skipRules/rules';

const rules = '#skip-rules';
const settingTabs: Record<string, string> = {
    skipOnSeekToSegment: 'matrix', skipResumeAction: 'matrix', speedUpResumeAction: 'matrix', previewIncludeOtherSegments: 'matrix',
    advanceSkipNotice: 'cards', skipNoticeDurationBefore: 'cards', skipNoticeDuration: 'cards', dontShowNotice: 'cards',
    audioNotificationOnSkip: 'cards', noticeVisibilityMode: 'cards', skipSoundVolume: 'cards', skipSoundFadeStart: 'cards',
};
async function open(page, extensionId: string, tab = 'segments') {
    await page.goto(`chrome-extension://${extensionId}/options/options.html?rulesTab=${tab}#skip-rules`);
    if (!await page.locator('#rule-engine-enabled').isChecked()) await toggleRuleEngine(page);
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
    await toggleRuleEngine(page);
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'skipEngineMode')).toBe('rules');
    await expect(page.locator(rules)).toBeVisible();
    await expect(page.locator('#classic-behavior')).toBeHidden();
    await expect(page.locator('.rules-tabs [role="tab"]')).toHaveCount(6);
    await page.locator('#rules-tab-matrix').click();
    await expect(page.locator('#rule-engine-disable')).toBeVisible();
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
    await toggleRuleEngine(other);
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
    await expect.poll(async () => (await readSyncStorage<Array<{ name: string; option: number }>>(extensionServiceWorker, 'categorySelections'))?.find(s => s.name === 'sponsor')?.option).toBe(1);
    await page.locator('#sponsorColorOption input').fill('#123456');
    await page.locator('#sponsorPreviewColorOption input').fill('#654321');
    await expect.poll(async () => (await readSyncStorage<Record<string, { color: string }>>(extensionServiceWorker, 'barTypes'))?.sponsor?.color).toBe('#123456');
    await expect.poll(async () => (await readSyncStorage<Record<string, { color: string }>>(extensionServiceWorker, 'barTypes'))?.['preview-sponsor']?.color).toBe('#654321');
    await toggleRuleEngine(page);
    await expect(page.locator('#category-home #sponsorSkipOption select')).toHaveValue('manualSkip');
    await expect(page.locator('#category-home #sponsorColorOption input')).toHaveValue('#123456');
    await toggleRuleEngine(page);
    await expect(page.locator(`${rules} #sponsorSkipOption select`)).toHaveValue('manualSkip');
    await page.reload();
    await expect(page.locator(`${rules} #sponsorPreviewColorOption input`)).toHaveValue('#654321');
});

test('overlap matrix explains its source and simulator releases protection at A end', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await writeSyncStorage(extensionServiceWorker, { speedUpPlaybackRate: 4 });
    await open(page, extensionId, 'matrix');
    const categories = await readSyncStorage(extensionServiceWorker, 'categorySelections');
    await page.locator('[data-matrix-context]').selectOption('overlap-review');
    await page.locator('[data-state="ready"][data-operation="natural"]').click();
    await expect(page.locator('.rules-result')).toContainText('回看保护来源：B');
    await expect(page.locator('.rules-result')).toContainText('受其他片段的回看保护');
    await page.locator('#rules-tab-simulator').click();
    await page.locator('.rules-sim-controls select').first().selectOption('overlapReview');
    await page.locator('.rules-sim-controls > button').click();
    await expect(page.locator('[data-simulation-ranges]')).toContainText('B: 15s–30s');
    await expect(page.locator('[data-rules-time]')).toHaveText('10s');
    const advance = page.locator('.rules-player-controls > button').nth(3);
    for (let i = 0; i < 6; i++) await advance.click();
    await expect(page.locator('[data-rules-time]')).toHaveText('16s');
    await expect(page.locator('.rules-player-meta')).toContainText('1×');
    await expect(page.locator('.rules-cards')).toContainText('受其他片段的回看保护');
    for (let i = 0; i < 4; i++) await advance.click();
    await expect(page.locator('[data-rules-time]')).toHaveText('20s');
    await expect(page.locator('.rules-player-meta')).toContainText('4×');
    expect(await readSyncStorage(extensionServiceWorker, 'categorySelections')).toEqual(categories);
});

test('matrix uses real saved settings and supports rule detail navigation', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await open(page, extensionId);
    await page.locator('#rules-tab-matrix').click();
    await page.locator('[data-rule-setting="skipOnSeekToSegment"]').selectOption('true');
    await page.locator('#rules-tab-matrix').click();
    await page.locator('[data-state="ready"][data-operation="front"]').click();
    await expect(page.locator('.rules-result dd').first()).toContainText('20');
    await page.locator('#rules-tab-segments').click();
    await page.locator('#rules-tab-matrix').click();
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
    await page.locator('#rules-tab-matrix').click();
    await page.locator('[data-rule-setting="skipResumeAction"]').selectOption('manual');
    await page.locator('#rules-tab-cards').click();
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
    await page.locator('#rules-tab-cards').click();
    await page.locator('[data-rule-setting="dontShowNotice"]').uncheck();
    await page.locator('#rules-tab-simulator').click();
    await expect(panel.locator('[data-card]')).toHaveCount(0);
    await page.locator('#rules-tab-segments').click();
    await page.locator('#rules-tab-cards').click();
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
    for (const tab of ['segments', 'matrix', 'cards', 'community', 'simulator', 'rules']) {
        await page.locator('#rules-tab-' + tab).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    const body = await page.locator(rules).textContent();
    expect(body).not.toMatch(/__MSG_/);
});


test('settings tabs cover every classic behavior setting and keep native controls functional', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await page.goto(`chrome-extension://${extensionId}/options/options.html#behavior`);
    await expect(page.locator('#sponsorSkipOption select')).toBeVisible();
    const originalKeys = await page.locator('#classic-behavior [data-sync]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-sync')));
    const communityKeys = await page.locator('#classic-behavior [data-sync="fullVideoSegments"], #classic-behavior [data-sync="fullVideoSegments"] [data-sync], #classic-behavior [data-sync="dynamicAndCommentSponsorBlocker"], #classic-behavior [data-sync="dynamicAndCommentSponsorBlocker"] [data-sync]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-sync')));
    // Include rule-only preferences and controls whose original home is the interface page.
    const allKeys = new Set([...originalKeys, ...Object.keys(settingTabs), 'enableSpeedUp', 'speedUpPlaybackRate', 'disableSkipping']);
    await toggleRuleEngine(page);
    const panel = page.locator('#rules-panel-segments');
    for (const key of allKeys) {
        await expect(page.locator(rules).locator(`[data-sync="${key}"], [data-rule-setting="${key}"]`)).toHaveCount(1);
        const home = communityKeys.includes(key) ? 'community' : settingTabs[key] ?? 'segments';
        await expect(page.locator(`#rules-panel-${home}`).locator(`[data-sync="${key}"], [data-rule-setting="${key}"]`)).toHaveCount(1);
    }
    const compositeSettings = {
        customSkipSound: '#rules-panel-cards [data-type="custom-skip-sound"]',
        categorySelections: '#rules-panel-segments #category-type', barTypes: '#rules-panel-segments #category-type',
        autoSkipOnMusicVideos: '#rules-panel-segments #autoSkipOnMusicVideos',
        whitelistedChannels: '#rules-panel-segments [data-type="react-WhitelistManagerComponent"]',
        dynamicSponsorSelections: '#rules-panel-community #DynamicSponsor', dynamicSponsorTypes: '#rules-panel-community #DynamicSponsor',
    };
    for (const selector of Object.values(compositeSettings)) await expect(page.locator(selector)).toHaveCount(1);
    await test.info().attach('configuration-coverage', {
        body: JSON.stringify({
            fields: [...allKeys].map(key => ({ key, tab: communityKeys.includes(key) ? 'community' : settingTabs[key] ?? 'segments' })),
            compositeSettings,
        }, null, 2), contentType: 'application/json',
    });
    await expect(page.locator('.rules-settings[data-settings-group]')).toHaveCount(3);
    await expect(page.locator('#rule-engine-disable')).toBeVisible();
    await panel.locator('label[for="forceChannelCheck"]').click();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'forceChannelCheck')).toBe(true);
    await page.locator('#rules-tab-cards').click();
    await page.locator('#rules-panel-cards label[for="audioNotificationOnSkip"]').click();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'audioNotificationOnSkip')).toBe(true);
    await page.locator('#rules-tab-segments').click();
    await expect(panel.locator('#fullVideoSegments, #dynamicAndCommentSponsorBlocker, #audioNotificationOnSkip')).toHaveCount(0);
    await expect(panel.locator('label[for="showCategoryWithoutPermission"]')).toBeVisible();
    await page.locator('#rules-tab-community').click();
    const community = page.locator('#rules-panel-community');
    const labels = community.locator('#fullVideoLabelsOnThumbnailsMode');
    await community.locator('label[for="fullVideoSegments"]').click();
    await expect(labels).toBeHidden();
    await community.locator('label[for="fullVideoSegments"]').click();
    await expect(labels).toBeVisible();
    page.once('dialog', dialog => dialog.dismiss());
    const previous = await labels.inputValue();
    await labels.selectOption('2');
    await expect(labels).toHaveValue(previous);
    await labels.selectOption('1');
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'fullVideoLabelsOnThumbnailsMode')).toBe(1);
    await community.locator('label[for="dynamicAndCommentSponsorBlocker"]').click();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'dynamicAndCommentSponsorBlocker')).toBe(true);
    await community.locator('#dynamicAndCommentSponsorRegexPattern').fill('migration-test');
    await community.locator('[data-sync="dynamicAndCommentSponsorRegexPattern"] .text-change-set').click();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'dynamicAndCommentSponsorRegexPattern')).toBe('migration-test');
    await toggleRuleEngine(page);
    await expect(page.locator('#behavior #audioNotificationOnSkip')).toBeChecked();
    await expect(page.locator('#behavior #dynamicAndCommentSponsorRegexPattern')).toHaveValue('migration-test');
    await expect(page.locator('#behavior #fullVideoLabelsOnThumbnailsMode')).toHaveValue('1');
    await toggleRuleEngine(page);
    await page.reload();
    await expect(page.locator('#rules-panel-cards #audioNotificationOnSkip')).toBeChecked();
    for (const tab of ['community', 'matrix', 'cards', 'simulator', 'rules']) {
        await page.locator('#rules-tab-' + tab).click();
        await expect(page.locator('.rules-settings[data-settings-group]:visible')).toHaveCount(['matrix', 'cards'].includes(tab) ? 1 : 0);
        await expect(page.locator('#rule-engine-disable')).toBeVisible();
    }
});

for (const mode of ['legacy', 'rules']) {
    test(`dependent options stay visible after rapid toggles in ${mode} settings`, async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
        await writeSyncStorage(extensionServiceWorker, { skipEngineMode: mode });
        await page.goto(`chrome-extension://${extensionId}/options/options.html#behavior`);
        if (mode === 'rules') await page.locator('#rules-tab-community').click();
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

test('whitelist remains editable and shortcuts stay on the original keyboard page', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await writeSyncStorage(extensionServiceWorker, { whitelistedChannels: [{ id: '1001', name: 'Migration Channel' }] });
    await open(page, extensionId);
    const panel = page.locator('#rules-panel-segments');
    await expect(panel.locator('.rules-whitelist')).toBeVisible();
    await expect(panel.locator('.rules-whitelist summary')).toHaveCount(0);
    const manager = panel.locator('[data-type="react-WhitelistManagerComponent"]');
    await expect(manager).toContainText('Migration Channel');
    page.once('dialog', dialog => dialog.accept());
    await manager.getByRole('row').filter({ hasText: 'Migration Channel' }).locator('.option-button').click();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'whitelistedChannels')).toEqual([]);
    for (const key of ['skipKeybind', 'skipToHighlightKeybind', 'closeSkipNoticeKeybind']) {
        await expect(page.locator(`${rules} [data-sync="${key}"]`)).toHaveCount(0);
        await expect(page.locator(`#keybinds [data-sync="${key}"]`)).toHaveCount(1);
    }
    await page.locator('[data-for="keybinds"]').click();
    await page.locator('#keybinds [data-sync="skipKeybind"] .keybind-buttons').click();
    await expect(page.locator('#keybind-dialog .dialog')).toBeVisible();
    await page.keyboard.press('k');
    await page.locator('#change-keybind-ctrl').check();
    await page.locator('#change-keybind-alt').check();
    await page.locator('#keybind-dialog .save-button').click();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'skipKeybind')).toMatchObject({ key: 'k', code: 'KeyK' });
    await expect(page.locator('#keybinds [data-sync="skipKeybind"] .keyBase')).toHaveText('K');
    await page.locator('[data-for="behavior"]').click();
    await expect(page.locator(`${rules} [data-sync="skipKeybind"]`)).toHaveCount(0);
    await page.locator('[data-for="keybinds"]').click();
    await expect(page.locator('#keybinds [data-sync="skipKeybind"] .keyBase')).toHaveText('K');
});

test('missing old padding is upgraded once without undoing a later user disable', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await writeSyncStorage(extensionServiceWorker, { paddingCategoryMigrated: false, categorySelections: [{ name: 'sponsor', option: 2 }] });
    await open(page, extensionId);
    await expect(page.locator('#paddingSkipOption select')).toHaveValue('autoSkip');
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'paddingCategoryMigrated')).toBe(true);
    await page.locator('#paddingSkipOption select').selectOption('disable');
    await expect.poll(async () => (await readSyncStorage<Array<{ name: string; option: number }>>(extensionServiceWorker, 'categorySelections'))?.find(s => s.name === 'padding')?.option).toBe(-1);
    await page.reload();
    await expect(page.locator('#paddingSkipOption select')).toHaveValue('disable');
});

test('matrix columns and result height stay stable when selecting rules near the page bottom', async ({ extensionPage: page, extensionId }) => {
    for (const width of [1300, 720]) {
        await page.setViewportSize({ width, height: 1000 });
        await open(page, extensionId, 'matrix');
        const widths: number[] = [];
        for (const group of ['movement', 'playback', 'exit', 'controls']) {
            await page.locator(`[data-rule-group="${group}"]`).click();
            widths.push(await page.locator('.rules-matrix thead th').first().evaluate(e => e.getBoundingClientRect().width));
        }
        expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
        await page.locator('[data-rule-group="movement"]').click();
        await page.locator('#options').evaluate(e => e.scrollTop = e.scrollHeight);
        const before = await page.locator('#options').evaluate(e => e.scrollTop);
        for (const state of ['closed', 'ready', 'undo', 'cancelled', 'completed']) {
            await page.locator(`[data-state="${state}"][data-operation="natural"]`).evaluate((e: HTMLButtonElement) => e.click());
            await expect(page.locator(`[data-state="${state}"][data-operation="natural"]`)).toHaveAttribute('aria-pressed', 'true');
            expect(await page.locator('.rules-result').evaluate(e => e.getBoundingClientRect().height)).toBe(590);
            expect(Math.abs(await page.locator('#options').evaluate(e => e.scrollTop) - before)).toBeLessThan(2);
        }
    }
    await page.locator('#rules-tab-rules').click();
    await expect(page.locator('.rules-scope')).toBeVisible();
    await expect(page.locator('.rules-scope')).toContainText('不连接真实视频');
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

test('every related setting opens its editable location without changing preferences', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await open(page, extensionId, 'rules');
    const targets = new Map<string, string>();
    for (const [id, rule] of Object.entries(ruleDefinitions)) for (const key of rule.settings) targets.set(key, id);
    const before = await Promise.all([...targets.keys()].map(key => readSyncStorage(extensionServiceWorker, key)));
    for (const [key, id] of targets) {
        await page.locator('#rules-tab-rules').click();
        await page.locator(`[data-rule-id="${id}"]`).click();
        await page.locator(`[data-related-setting="${key}"]`).click();
        await expect(page.locator('#rules-tab-' + (settingTabs[key] ?? 'segments'))).toHaveAttribute('aria-selected', 'true');
        const target = page.locator(`[data-setting-highlight="${key}"]`);
        await expect(target).toBeVisible();
        await expect(target).toBeFocused();
        await expect(target).toBeInViewport();
    }
    expect(await Promise.all([...targets.keys()].map(key => readSyncStorage(extensionServiceWorker, key)))).toEqual(before);
});

test('users can replace countdown values and configure fast-forward beside its switch', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await open(page, extensionId);
    const settings = page.locator('#rules-panel-cards .rules-settings');
    await page.locator('#rules-tab-cards').click();
    await settings.locator('[data-rule-setting="advanceSkipNotice"]').check();
    await page.evaluate(() => {
        const changes = (window as unknown as { durationWrites: Record<string, number[]> }).durationWrites = {};
        chrome.storage.onChanged.addListener((updates, area) => {
            if (area !== 'sync') return;
            for (const key of ['skipNoticeDurationBefore', 'skipNoticeDuration']) {
                if (updates[key]) (changes[key] ??= []).push(updates[key].newValue);
            }
        });
    });
    for (const key of ['skipNoticeDurationBefore', 'skipNoticeDuration']) {
        const input = settings.locator(`[data-rule-setting="${key}"]`);
        await input.fill('');
        await expect(input).toHaveValue('');
        await input.pressSequentially('12');
        await input.blur();
        await expect(input).toHaveValue('12');
        await expect.poll(() => readSyncStorage(extensionServiceWorker, key)).toBe(12);
        // Intermediate digits must never be saved and echoed over the current edit.
        await expect.poll(() => page.evaluate(key =>
            (window as unknown as { durationWrites: Record<string, number[]> }).durationWrites[key], key)).toEqual([12]);
        await input.fill('0');
        await input.blur();
        await expect(input).toHaveValue('12');
    }
    await page.locator('#rules-tab-segments').click();
    const defaults = page.locator('#rules-panel-segments .rules-settings');
    const speed = defaults.locator('[data-rule-setting="enableSpeedUp"]');
    await expect(speed).not.toBeChecked();
    const previousSpeed = await readSyncStorage(extensionServiceWorker, 'enableSpeedUp');
    await defaults.locator('[data-rule-setting="speedUpPlaybackRate"]').selectOption('4');
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'speedUpPlaybackRate')).toBe(4);
    expect(await readSyncStorage(extensionServiceWorker, 'enableSpeedUp')).toBe(previousSpeed);
    await speed.check();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'enableSpeedUp')).toBe(true);
    await page.reload();
    await expect(speed).toBeChecked();
    await expect(settings.locator('[data-rule-setting="skipNoticeDuration"]')).toHaveValue('12');
    await defaults.getByRole('button', { name: '恢复本组默认值' }).click();
    await expect(speed).not.toBeChecked();
    await expect(settings.locator('[data-rule-setting="skipNoticeDuration"]')).toHaveValue('12');
    await expect(defaults.locator('[data-rule-setting="speedUpPlaybackRate"]')).toHaveValue('2');
});

test('notice appearance is in the settings grid and previews every visibility mode with hover expansion', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await open(page, extensionId, 'cards');
    const panel = page.locator('#rules-panel-cards');
    const appearance = panel.locator('.rules-setting-grid #noticeVisibilityMode');
    await expect(appearance).toBeVisible();
    await panel.locator('[data-rule-setting="advanceSkipNotice"]').check();
    const card = panel.locator('[data-card="A"]');
    for (const mode of [0, 1, 2, 3, 4]) {
        await appearance.selectOption(String(mode));
        await expect.poll(() => readSyncStorage(extensionServiceWorker, 'noticeVisibilityMode')).toBe(mode);
        for (const phase of ['preview', 'pending', 'speeding', 'completed']) {
            await panel.locator(`[data-card-preview="${phase}"]`).click();
            await page.mouse.move(0, 0);
            const small = mode >= 2 || mode === 1 && phase === 'completed';
            const faded = mode === 4 || mode === 3 && phase === 'completed';
            await expect(card).toHaveAttribute('data-small', String(small));
            await expect(card).toHaveCSS('opacity', faded ? '0.5' : '1');
            await expect(card.locator('.rules-card-detail')).toHaveCSS('max-height', small ? '0px' : '120px');
        }
    }
    await card.hover();
    await expect(card).toHaveCSS('opacity', '1');
    await expect(card.locator('.rules-card-detail')).toHaveCSS('max-height', '120px');
    await page.mouse.move(0, 0);
    await expect(card).toHaveCSS('opacity', '0.5');
    await panel.getByRole('button', { name: '恢复本组默认值' }).click();
    await expect(appearance).toHaveValue('3');
    await toggleRuleEngine(page);
    await page.locator('[data-for="interface"]').click();
    await expect(page.locator('#interface #noticeVisibilityMode')).toBeVisible();
    await expect(page.locator('#noticeVisibilityMode')).toHaveCount(1);
});

test('card settings update state examples and reset only the reminder group', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await writeSyncStorage(extensionServiceWorker, { skipResumeAction: 'manual', enableSpeedUp: true });
    await open(page, extensionId, 'cards');
    const panel = page.locator('#rules-panel-cards');
    await panel.locator('[data-rule-setting="advanceSkipNotice"]').check();
    await panel.locator('[data-rule-setting="skipNoticeDuration"]').fill('9');
    for (const phase of ['preview', 'pending', 'speeding', 'completed']) {
        await panel.locator(`[data-card-preview="${phase}"]`).click();
        await expect(panel.locator('[data-card="A"]')).toBeVisible();
    }
    await expect(panel.locator('.rules-clock')).toContainText('9');
    await panel.locator('[data-rule-setting="dontShowNotice"]').uncheck();
    await expect(panel.locator('[data-card="A"]')).toHaveCount(0);
    await panel.getByRole('button', { name: '恢复本组默认值' }).click();
    await expect(panel.locator('[data-rule-setting="dontShowNotice"]')).toBeChecked();
    await expect(panel.locator('.rules-clock')).toContainText('4');
    expect(await readSyncStorage(extensionServiceWorker, 'skipResumeAction')).toBe('manual');
    expect(await readSyncStorage(extensionServiceWorker, 'enableSpeedUp')).toBe(true);
});

test('related settings can be changed beside a matrix result and a paused simulation', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await open(page, extensionId, 'matrix');
    const matrix = page.locator('#rules-panel-matrix');
    await matrix.locator('[data-state="ready"][data-operation="front"]').click();
    await matrix.locator('.rules-context-settings summary').click();
    await matrix.locator('[data-inline-setting="skipOnSeekToSegment"]').selectOption('true');
    await expect(matrix.locator('[data-rule-setting="skipOnSeekToSegment"]')).toHaveValue('true');
    await expect(matrix.locator('.rules-result dd').first()).toContainText('20');
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'skipOnSeekToSegment')).toBe(true);
    await page.locator('#rules-tab-simulator').click();
    const simulator = page.locator('#rules-panel-simulator');
    await simulator.getByRole('button', { name: '载入场景', exact: true }).click();
    await simulator.locator('.rules-context-settings summary').click();
    await simulator.locator('[data-inline-setting="skipResumeAction"]').selectOption('manual');
    await simulator.getByRole('button', { name: '恢复播放', exact: true }).click();
    await expect(simulator.locator('[data-rules-time]')).toHaveText('15s');
    await expect(simulator.locator('[data-card-action="skip"]')).toBeVisible();
    await page.locator('#rules-tab-matrix').click();
    await expect(matrix.locator('[data-rule-setting="skipResumeAction"]')).toHaveValue('manual');
});


test('all categories persist explicit disabling in both settings views', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await open(page, extensionId);
    for (const category of categoryList) await page.locator(`#${category}SkipOption select`).selectOption('disable');
    await expect.poll(async () => (await readSyncStorage<Array<{ name: string; option: number }>>(extensionServiceWorker, 'categorySelections'))
        ?.filter(selection => categoryList.includes(selection.name) && selection.option === -1).length).toBe(categoryList.length);
    await toggleRuleEngine(page);
    await expect(page.locator('#classic-behavior')).toBeVisible();
    for (const category of categoryList) await expect(page.locator(`#${category}SkipOption select`)).toHaveValue('disable');
    await writeSyncStorage(extensionServiceWorker, { paddingCategoryMigrated: false });
    await page.reload();
    for (const category of categoryList) await expect(page.locator(`#${category}SkipOption select`)).toHaveValue('disable');
    await page.locator('#paddingSkipOption select').selectOption('autoSkip');
    await toggleRuleEngine(page);
    await expect(page.locator('#paddingSkipOption select')).toHaveValue('autoSkip');
    for (const category of categoryList.filter(category => category !== 'padding')) await expect(page.locator(`#${category}SkipOption select`)).toHaveValue('disable');
});
