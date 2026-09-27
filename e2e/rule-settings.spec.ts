import { test, expect } from './fixtures/extension';
import { readSyncStorage, writeSyncStorage } from './support/extensionStorage';

const rules = '#skip-rules';
async function open(page, extensionId: string, tab = 'segments') {
    await page.goto(`chrome-extension://${extensionId}/options/options.html?rulesTab=${tab}#skip-rules`);
    await expect(page.locator('#rules-tab-' + tab)).toHaveAttribute('aria-selected', 'true');
}

test('behavior switch selects actual engine mode and stays synchronized with shadow selector', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    await expect(page.locator('#rule-engine-enabled')).not.toBeChecked();
    await page.locator('label[for="rule-engine-enabled"]').click();
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'skipEngineMode')).toBe('rules');
    await expect(page.locator('#skipEngineMode')).toHaveValue('rules');
    await page.locator('#open-rule-settings').click();
    await expect(page.locator(rules)).toBeVisible();
    await expect(page.locator('[data-for="skip-rules"]')).toHaveCount(1);
    await expect(page.locator('.rules-tabs [role="tab"]')).toHaveCount(4);
    await page.locator('[data-for="behavior"]').click();
    await page.locator('#skipEngineMode').selectOption('shadow');
    await expect(page.locator('#rule-engine-enabled')).not.toBeChecked();
    await page.reload();
    await expect(page.locator('#skipEngineMode')).toHaveValue('shadow');
    await expect(page.locator('#rule-engine-enabled')).not.toBeChecked();
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
    await page.locator('[data-for="behavior"]').click();
    await expect(page.locator('#category-home #sponsorSkipOption select')).toHaveValue('manualSkip');
    await expect(page.locator('#category-home #sponsorColorOption input')).toHaveValue('#123456');
    await page.locator('[data-for="skip-rules"]').click();
    await expect(page.locator(`${rules} #sponsorSkipOption select`)).toHaveValue('manualSkip');
    await page.reload();
    await expect(page.locator(`${rules} #sponsorPreviewColorOption input`)).toHaveValue('#654321');
});

test('matrix uses real saved settings and supports rule detail navigation', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await open(page, extensionId, 'matrix');
    await page.locator('[data-rule-setting="skipOnSeekToSegment"]').selectOption('true');
    await page.locator('[data-state="ready"][data-operation="front"]').click();
    await expect(page.locator('.rules-result dd').first()).toContainText('20');
    await page.locator('[data-rule-setting="skipOnSeekToSegment"]').selectOption('false');
    await expect(page.locator('.rules-result dd').first()).not.toContainText('20');
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'skipOnSeekToSegment')).toBe(false);
    await page.locator('.rules-result .rules-trace button').first().click();
    await expect(page.locator('#rules-tab-rules')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.rules-description h3')).not.toBeEmpty();
    await page.locator('.rules-description > .rules-link').click();
    await expect(page.locator('#rules-tab-matrix')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-state="ready"][data-operation="front"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-rule-setting="skipResumeAction"]').selectOption('manual');
    await page.locator('[data-rule-setting="advanceSkipNotice"]').check();
    await page.locator('[data-for="interface"]').click();
    await expect(page.locator('[data-sync="skipNoticeDurationBefore"]')).toBeVisible();
    await page.locator('[data-for="behavior"]').click();
    await expect(page.locator('#skipResumeAction')).toHaveValue('manual');
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
    await page.locator('[data-rule-setting="dontShowNotice"]').uncheck();
    await expect(panel.locator('[data-card]')).toHaveCount(0);
    await page.locator('[data-rule-setting="dontShowNotice"]').check();
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
