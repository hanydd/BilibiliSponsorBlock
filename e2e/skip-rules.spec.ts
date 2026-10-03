import { toggleRuleEngine } from './support/ruleEngine';
import { test, expect } from './fixtures/extension';
import { writeSyncStorage, readSyncStorage } from './support/extensionStorage';
import { defaultMockBvid, defaultMockCid, routeMockBilibiliVideoPage, setMockVideoTime, getMockVideoTime, pauseMockVideo } from './support/bilibiliPage';
import { routeMockSponsorSegments } from './support/sponsorBlockApi';
import { waitForBilibiliContentScript } from './support/submissionNotice';

const cards = '.sponsorSkipStackCard';
const first = `${cards}[id*="rules-A"]`;
const second = `${cards}[id*="rules-B"]`;
const rate = page => page.locator('video').evaluate((v: HTMLVideoElement) => v.playbackRate);
const play = page => page.locator('video').evaluate((v: HTMLVideoElement) => v.play());

async function setup({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }, config = {}, ranges = [[10, 20], [20, 40]], actions: string[] = [], fixture: { categories?: string[]; expectedCount?: number } = {}) {
    await writeSyncStorage(extensionServiceWorker, {
        skipEngineMode: 'rules', enableSpeedUp: false, skipOnSeekToSegment: true, advanceSkipNotice: false,
        skipNoticeDuration: 8, noticeVisibilityMode: 2, dontShowNotice: false, trackViewCount: false,
        categorySelections: [{ name: 'sponsor', option: 2 }], ...config,
    });
    await routeMockSponsorSegments(extensionContext, defaultMockBvid, ranges.map((segment, i) => ({
        segment: segment as [number, number], UUID: `rules-${String.fromCharCode(65 + i)}`, category: fixture.categories?.[i] ?? 'sponsor',
        actionType: actions[i] || 'skip', cid: defaultMockCid, videoDuration: 120,
    })));
    await routeMockBilibiliVideoPage(page, { currentTime: 0, paused: true });
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);
    await expect.poll(async () => (await sendContentMessage({ message: 'isInfoFound', updating: true })).sponsorTimes?.length).toBe(fixture.expectedCount ?? ranges.length);
    await page.waitForTimeout(300);
}

test('rules merge instant execution but show each result card', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures);
    const page = fixtures.extensionPage;
    await setMockVideoTime(page, 12, true); await play(page);
    await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(40);
    await expect(page.locator(first)).toHaveCount(1); await expect(page.locator(second)).toHaveCount(1);
});

test('rules distinguish inside seek from entry in either direction', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, { skipOnSeekToSegment: false }, [[10, 50]]);
    const page = fixtures.extensionPage;
    await setMockVideoTime(page, 15, true); await play(page);
    await expect(page.locator(first)).toHaveCount(1);
    expect(await getMockVideoTime(page)).toBeLessThan(25);
    await writeSyncStorage(fixtures.extensionServiceWorker, { skipOnSeekToSegment: true });
    await setMockVideoTime(page, 30, true); await page.waitForTimeout(250);
    expect(await getMockVideoTime(page)).toBeLessThan(40);
    await setMockVideoTime(page, 60, true); await setMockVideoTime(page, 15, true);
    await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(50);
});

test('rules pause only updates cards and resumes at the final location', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, {}, [[10, 20], [30, 40]]);
    const page = fixtures.extensionPage;
    await setMockVideoTime(page, 12, true);
    await expect(page.locator(first)).toHaveCount(1);
    await page.waitForTimeout(300); expect(await getMockVideoTime(page)).toBe(12);
    await setMockVideoTime(page, 32, true);
    await expect(page.locator(second)).toHaveCount(1);
    await play(page);
    await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(40);
});

test('rules dismissal cancels only this visit and restores speed', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, { enableSpeedUp: true, speedUpPlaybackRate: 4 }, [[10, 50]]);
    const page = fixtures.extensionPage;
    await setMockVideoTime(page, 12, true); await play(page);
    await expect.poll(() => rate(page)).toBe(4);
    await page.locator(first).locator('.sponsorSkipNoticeCloseButton').click();
    await expect.poll(() => rate(page)).toBe(1);
    await expect(page.locator(first)).toHaveCount(0);
    await setMockVideoTime(page, 30, true); await page.waitForTimeout(300);
    expect(await rate(page)).toBe(1); await expect(page.locator(first)).toHaveCount(0);
    await setMockVideoTime(page, 60, true); await setMockVideoTime(page, 15, true);
    await expect.poll(() => rate(page)).toBe(4);
    await expect(page.locator(first)).toHaveCount(1);
});

test('rules undo returns the selected segment and does not skip again', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures);
    const page = fixtures.extensionPage;
    await setMockVideoTime(page, 12, true); await play(page);
    await expect(page.locator(second)).toHaveCount(1);
    await page.locator(second).locator('[id^="sponsorSkipUnskipButton"]').first().click();
    await page.waitForTimeout(350);
    expect(await getMockVideoTime(page)).toBeGreaterThanOrEqual(20);
    expect(await getMockVideoTime(page)).toBeLessThan(25);
});

test('review of completed A protects overlapping B until A ends, including a paused undo', async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await setup({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage },
        { enableSpeedUp: true, speedUpPlaybackRate: 4, skipNoticeDuration: 60 }, [[10, 20], [15, 30]]);
    await setMockVideoTime(page, 12, true); await play(page);
    await expect.poll(() => rate(page)).toBe(4);
    // Natural completion keeps A's result card; a test seek across its end would not.
    await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(22);
    await pauseMockVideo(page);
    await page.locator(first).locator('[id^="sponsorSkipUnskipButton"]').first().click();
    await expect.poll(() => getMockVideoTime(page)).toBe(10);
    await expect.poll(() => rate(page)).toBe(1);
    await setMockVideoTime(page, 16, true); await play(page);
    await expect.poll(() => getMockVideoTime(page)).toBeGreaterThan(16.5);
    expect(await rate(page)).toBe(1);
    await expect(page.locator(second)).toBeVisible();
    await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(20);
    await expect.poll(() => rate(page)).toBe(4);
    await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(30);
    await expect.poll(() => rate(page)).toBe(1);
});

test('rules manual button skips immediately even when speedup is selected', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, { enableSpeedUp: true, categorySelections: [{ name: 'sponsor', option: 1 }] }, [[10, 50]]);
    const page = fixtures.extensionPage;
    await setMockVideoTime(page, 12, true);
    await expect(page.locator(first)).toHaveCount(1);
    await page.locator(first).locator('[id^="sponsorSkipUnskipButton"]').first().click();
    expect(await getMockVideoTime(page)).toBe(50);
    expect(await rate(page)).toBe(1);
    expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
});

test('shadow leaves dismissal semantics and playback with the legacy engine', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, { skipEngineMode: 'shadow', enableSpeedUp: true, speedUpPlaybackRate: 4 }, [[10, 50]]);
    const page = fixtures.extensionPage;
    await setMockVideoTime(page, 12, true); await play(page);
    await expect.poll(() => rate(page)).toBe(4);
    await page.locator(first).locator('.sponsorSkipNoticeCloseButton').click();
    await page.waitForTimeout(300);
    expect(await rate(page)).toBe(4);
    await pauseMockVideo(page);
});

test('engine setting can be switched and persists for the next video page load', async ({ extensionPage: page, extensionId, extensionServiceWorker }) => {
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    await expect(page.locator('#rule-engine-enabled')).not.toBeChecked();
    await toggleRuleEngine(page);
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'skipEngineMode')).toBe('rules');
    await toggleRuleEngine(page);
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'skipEngineMode')).toBe('legacy');
});

test('rules restore nested mute after pause and segment exit', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, { enableSpeedUp: true, speedUpPlaybackRate: 4, muteSegments: true }, [[10, 60], [15, 25]], ['skip', 'mute']);
    const page = extensionPage;
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.muted = false; });
    await setMockVideoTime(page, 16, true); await play(page);
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
    await pauseMockVideo(page); await page.waitForTimeout(300); await play(page);
    await setMockVideoTime(page, 30, true);
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.muted)).toBe(false);
    await expect.poll(() => rate(page)).toBe(4);
    await setMockVideoTime(page, 65, true);
    await expect.poll(() => rate(page)).toBe(1);
});

test('rules manual mute stays active until cancelled without seeking', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, { muteSegments: true, categorySelections: [{ name: 'sponsor', option: 1 }] }, [[10, 50]], ['mute']);
    const page = extensionPage;
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.muted = false; });
    await setMockVideoTime(page, 15, true); await play(page);
    const button = page.locator(first).locator('[id^="sponsorSkipUnskipButton"]').first();
    await button.click();
    await page.waitForTimeout(300);
    expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
    await button.click();
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.muted)).toBe(false);
    expect(await getMockVideoTime(page)).toBeGreaterThan(15);
});

test('rules editor controls whether other segments take part', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, {}, [[10, 50]]);
    const name = await extensionServiceWorker.evaluate(() => chrome.i18n.getMessage('category_sponsor'));
    await sendContentMessage({ message: 'importSegments', data: `1:00 - 1:10 ${name}` });
    const checkbox = extensionPage.locator('#previewIncludeOtherSegments');
    await expect(checkbox).toBeVisible(); await expect(checkbox).not.toBeChecked();
    await setMockVideoTime(extensionPage, 15, true); await play(extensionPage);
    await extensionPage.waitForTimeout(300);
    expect(await getMockVideoTime(extensionPage)).toBeLessThan(25);
    await checkbox.check();
    await expect.poll(() => getMockVideoTime(extensionPage)).toBeGreaterThanOrEqual(50);
});

test('rules cancelling a preview survives pause and only explicit skip completes it', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, { advanceSkipNotice: true, skipNoticeDurationBefore: 3 }, [[10, 50]]);
    const page = extensionPage;
    await setMockVideoTime(page, 8, true);
    const card = page.locator(first);
    await expect(card).toHaveClass(/sponsorSkipUpcomingNotice/);
    const original = await card.elementHandle();
    await card.locator('[id^="sponsorSkipUnskipButton"]').first().click();
    await setMockVideoTime(page, 12, true); await play(page);
    await page.waitForTimeout(300);
    expect(await getMockVideoTime(page)).toBeLessThan(20);
    expect(await original.evaluate(element => element.isConnected)).toBe(true);
    await card.locator('[id^="sponsorSkipUnskipButton"]').first().click();
    await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(50);
});

test('rules honour speed selected by the user while paused', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, { enableSpeedUp: true, speedUpPlaybackRate: 4 }, [[10, 50]]);
    const page = extensionPage;
    await setMockVideoTime(page, 12, true); await play(page);
    await expect.poll(() => rate(page)).toBe(4);
    await pauseMockVideo(page);
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.playbackRate = 2; });
    await page.waitForTimeout(200); await play(page);
    expect(await rate(page)).toBe(2);
    await setMockVideoTime(page, 55, true);
    expect(await rate(page)).toBe(2);
});

test('rules hidden notices do not cancel playback', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, { dontShowNotice: true, enableSpeedUp: true, speedUpPlaybackRate: 4 }, [[10, 50]]);
    await setMockVideoTime(extensionPage, 12, true); await play(extensionPage);
    await expect.poll(() => rate(extensionPage)).toBe(4);
    await expect(extensionPage.locator(cards)).toHaveCount(0);
});

test.afterEach(async ({ extensionPage, sendContentMessage }) => {
    if (!extensionPage.url().startsWith('https://www.bilibili.com/video/')) return;
    const logs = await sendContentMessage<{ logs: { debug: string[] } }>({ message: 'getLogs' });
    expect(logs.logs.debug.filter(line => line.includes('[SB Rules] stopped:'))).toEqual([]);
});

test('reload switches the actual executor between rules and legacy', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, { enableSpeedUp: true, speedUpPlaybackRate: 4 }, [[10, 50]]);
    const page = extensionPage;
    for (const mode of ['legacy', 'rules']) {
        await writeSyncStorage(extensionServiceWorker, { skipEngineMode: mode });
        await page.reload();
        await waitForBilibiliContentScript(page, sendContentMessage);
        await expect.poll(async () => (await sendContentMessage<{ sponsorTimes: unknown[] }>({ message: 'isInfoFound', updating: true })).sponsorTimes?.length).toBe(1);
        await setMockVideoTime(page, 12, true); await play(page);
        await expect.poll(() => rate(page)).toBe(4);
        await page.locator(first).locator('.sponsorSkipNoticeCloseButton').click();
        await page.waitForTimeout(300);
        expect(await rate(page)).toBe(mode === 'rules' ? 1 : 4);
    }
});

test('rules hiding a segment from the popup excludes only the current visit', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, { enableSpeedUp: true, speedUpPlaybackRate: 4 }, [[10, 50]]);
    await setMockVideoTime(extensionPage, 15, true); await play(extensionPage);
    await expect.poll(() => rate(extensionPage)).toBe(4);
    await sendContentMessage({ message: 'hideSegment', UUID: 'rules-A', type: 3 });
    await expect.poll(() => rate(extensionPage)).toBe(1);
    const info = () => sendContentMessage<{ sponsorTimes: Array<{ hidden?: number }> }>({ message: 'isInfoFound', updating: true });
    expect((await info()).sponsorTimes[0].hidden).toBe(3);
    await setMockVideoTime(extensionPage, 60, true);
    await setMockVideoTime(extensionPage, 15, true);
    await expect.poll(() => rate(extensionPage)).toBe(4);
    expect((await info()).sponsorTimes[0].hidden).toBeUndefined();
});

test('rules undo protects the selected point from overlapping auto segments', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, {}, [[10, 30], [20, 40]]);
    await setMockVideoTime(extensionPage, 15, true); await play(extensionPage);
    await expect(extensionPage.locator(second)).toHaveCount(1);
    await extensionPage.locator(second).locator('[id^="sponsorSkipUnskipButton"]').first().click();
    await extensionPage.waitForTimeout(350);
    expect(await getMockVideoTime(extensionPage)).toBeGreaterThanOrEqual(20);
    expect(await getMockVideoTime(extensionPage)).toBeLessThan(25);
});

test('rules release overlapping speed members together after user changes rate', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, { enableSpeedUp: true, speedUpPlaybackRate: 4 }, [[10, 50], [15, 60]]);
    await setMockVideoTime(extensionPage, 20, true); await play(extensionPage);
    await expect.poll(() => rate(extensionPage)).toBe(4);
    await extensionPage.locator('video').evaluate((v: HTMLVideoElement) => { v.playbackRate = 2; });
    await expect.poll(() => rate(extensionPage)).toBe(2);
    await setMockVideoTime(extensionPage, 25, true);
    await pauseMockVideo(extensionPage); await play(extensionPage);
    await extensionPage.waitForTimeout(250);
    expect(await rate(extensionPage)).toBe(2);
    await setMockVideoTime(extensionPage, 65, true);
    expect(await rate(extensionPage)).toBe(2);
    await setMockVideoTime(extensionPage, 20, true);
    await expect.poll(() => rate(extensionPage)).toBe(4);
});

test('rules can show cards again during the same visit without cancelling speed', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, { dontShowNotice: true, enableSpeedUp: true, speedUpPlaybackRate: 4 }, [[10, 80]]);
    await setMockVideoTime(extensionPage, 15, true); await play(extensionPage);
    await expect.poll(() => rate(extensionPage)).toBe(4);
    await expect(extensionPage.locator(first)).toHaveCount(0);
    await writeSyncStorage(extensionServiceWorker, { dontShowNotice: false });
    await expect(extensionPage.locator(first)).toHaveCount(1);
    expect(await rate(extensionPage)).toBe(4);
    await writeSyncStorage(extensionServiceWorker, { dontShowNotice: true });
    await expect(extensionPage.locator(first)).toHaveCount(0);
    expect(await rate(extensionPage)).toBe(4);
    await writeSyncStorage(extensionServiceWorker, { dontShowNotice: false });
    await expect(extensionPage.locator(first)).toHaveCount(1);
});

test('rules manual-on-resume keeps the paused entry actionable until explicit skip', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, { skipResumeAction: 'manual' }, [[10, 50]]);
    await setMockVideoTime(extensionPage, 15, true); await play(extensionPage);
    await expect(extensionPage.locator(first)).toHaveCount(1);
    await extensionPage.waitForTimeout(300);
    expect(await getMockVideoTime(extensionPage)).toBeLessThan(25);
    await setMockVideoTime(extensionPage, 20, true);
    expect(await getMockVideoTime(extensionPage)).toBeLessThan(30);
    await extensionPage.locator(first).locator('[id^="sponsorSkipUnskipButton"]').first().click();
    await expect.poll(() => getMockVideoTime(extensionPage)).toBeGreaterThanOrEqual(50);
});

test('rules resume speed preference does not affect buffering and resets after leaving', async ({ extensionContext, extensionPage, extensionServiceWorker, sendContentMessage }) => {
    const fixtures = { extensionContext, extensionPage, extensionServiceWorker, sendContentMessage };
    await setup(fixtures, { enableSpeedUp: true, speedUpPlaybackRate: 4, speedUpResumeAction: 'manual' }, [[10, 60]]);
    await setMockVideoTime(extensionPage, 15, true); await play(extensionPage);
    await expect.poll(() => rate(extensionPage)).toBe(4);
    await extensionPage.locator('video').evaluate((v: HTMLVideoElement) => { v.dispatchEvent(new Event('waiting')); v.dispatchEvent(new Event('playing')); });
    await expect.poll(() => rate(extensionPage)).toBe(4);
    await pauseMockVideo(extensionPage); await play(extensionPage);
    await expect.poll(() => rate(extensionPage)).toBe(1);
    await expect(extensionPage.locator(first)).toHaveCount(1);
    await setMockVideoTime(extensionPage, 30, true);
    expect(await rate(extensionPage)).toBe(1);
    await setMockVideoTime(extensionPage, 70, true); await setMockVideoTime(extensionPage, 15, true);
    await expect.poll(() => rate(extensionPage)).toBe(4);
});

test('settings page switches the running engine without reloading the video', async ({ extensionContext, extensionPage: page, extensionId, extensionServiceWorker, sendContentMessage }) => {
    await setup({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }, { skipEngineMode: 'legacy', enableSpeedUp: true, speedUpPlaybackRate: 4 }, [[10, 90]]);
    await setMockVideoTime(page, 12, true); await play(page);
    await expect.poll(() => rate(page)).toBe(4);
    const settings = await extensionContext.newPage();
    await settings.goto(`chrome-extension://${extensionId}/options/options.html#behavior`);
    await toggleRuleEngine(settings);
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'skipEngineMode')).toBe('rules');
    await expect(page.locator(first)).toHaveCount(1);
    await page.locator(first).locator('.sponsorSkipNoticeCloseButton').click();
    // Rule-engine dismissal cancels this visit; the old engine would keep fast-forwarding.
    await expect.poll(() => rate(page)).toBe(1);
    await toggleRuleEngine(settings);
    await expect.poll(() => rate(page)).toBe(4);
    await expect(page.locator(first)).toHaveCount(1);
    await page.locator(first).locator('.sponsorSkipNoticeCloseButton').click();
    await page.waitForTimeout(300);
    expect(await rate(page)).toBe(4);
    await pauseMockVideo(page);
    const pausedAt = await getMockVideoTime(page);
    await toggleRuleEngine(settings);
    await expect.poll(() => rate(page)).toBe(1);
    expect(await getMockVideoTime(page)).toBe(pausedAt);
    expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await play(page);
    await expect.poll(() => rate(page)).toBe(4);
    await settings.close();
});

test('switching engines releases mute ownership and keeps paused video stationary', async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await setup({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }, { muteSegments: true }, [[10, 50]], ['mute']);
    const muted = () => page.locator('video').evaluate((v: HTMLVideoElement) => v.muted);
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.muted = false; });
    await setMockVideoTime(page, 12, true); await play(page);
    await expect.poll(muted).toBe(true);
    await pauseMockVideo(page);
    const pausedAt = await getMockVideoTime(page);
    await writeSyncStorage(extensionServiceWorker, { skipEngineMode: 'legacy' });
    await expect.poll(muted).toBe(false);
    expect(await getMockVideoTime(page)).toBe(pausedAt);
    await play(page);
    await expect.poll(muted).toBe(true);
    await writeSyncStorage(extensionServiceWorker, { skipEngineMode: 'rules' });
    await page.waitForTimeout(300);
    await setMockVideoTime(page, 60, true);
    await expect.poll(muted).toBe(false);
});

test('duration preference releases fast-forward while paused and reevaluates the same visit', async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await setup({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }, { enableSpeedUp: true, speedUpPlaybackRate: 4 }, [[10, 50]]);
    await setMockVideoTime(page, 12, true); await play(page);
    await expect.poll(() => rate(page)).toBe(4);
    await pauseMockVideo(page);
    const position = await getMockVideoTime(page);
    await writeSyncStorage(extensionServiceWorker, { minDuration: 41 });
    await expect.poll(() => rate(page)).toBe(1);
    await expect(page.locator(first)).toHaveCount(0);
    expect(await getMockVideoTime(page)).toBe(position);
    await writeSyncStorage(extensionServiceWorker, { minDuration: 40 });
    await expect(page.locator(first)).toHaveCount(1);
    expect(await rate(page)).toBe(1);
    await expect.poll(async () => (await sendContentMessage({ message: 'isInfoFound', updating: true })).sponsorTimes[0].hidden).toBeUndefined();
    await play(page);
    await expect.poll(() => rate(page)).toBe(4);
});

test('enabling mute reloads missing data and disabling it while paused releases owned mute', async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await setup({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }, { muteSegments: false }, [[10, 50]], ['mute'], { expectedCount: 0 });
    const muted = () => page.locator('video').evaluate((v: HTMLVideoElement) => v.muted);
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.muted = false; });
    await setMockVideoTime(page, 12, true);
    await expect(page.locator(first)).toHaveCount(0);
    await writeSyncStorage(extensionServiceWorker, { muteSegments: true });
    await expect(page.locator(first)).toHaveCount(1);
    expect(await muted()).toBe(false);
    await play(page); await expect.poll(muted).toBe(true);
    await pauseMockVideo(page);
    await writeSyncStorage(extensionServiceWorker, { muteSegments: false });
    await expect.poll(muted).toBe(false);
    await expect(page.locator(first)).toHaveCount(0);
    await expect.poll(async () => (await sendContentMessage({ message: 'isInfoFound', updating: true })).sponsorTimes.length).toBe(0);
    await writeSyncStorage(extensionServiceWorker, { muteSegments: true });
    await expect(page.locator(first)).toHaveCount(1);
    expect(await muted()).toBe(false);
    await play(page); await expect.poll(muted).toBe(true);
});

test('music and full-video facts survive display and category filtering and compose before execution', async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await setup({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }, {
        autoSkipOnMusicVideos: true, manualSkipOnFullVideo: true, fullVideoSegments: false,
        categorySelections: [{ name: 'sponsor', option: 1 }],
    }, [[10, 50], [0, 0], [60, 70]], ['skip', 'full', 'skip'], { categories: ['sponsor', 'sponsor', 'music_offtopic'], expectedCount: 1 });
    await setMockVideoTime(page, 12, true); await play(page);
    await expect(page.locator(first)).toHaveCount(1);
    await page.waitForTimeout(300);
    expect(await getMockVideoTime(page)).toBeLessThan(20);
    // Full-video manual wins over music auto, even though full labels are hidden.
    await writeSyncStorage(extensionServiceWorker, { fullVideoSegments: true });
    await expect.poll(async () => (await sendContentMessage({ message: 'isInfoFound', updating: true })).sponsorTimes.length).toBe(2);
    await writeSyncStorage(extensionServiceWorker, { fullVideoSegments: false });
    await expect.poll(async () => (await sendContentMessage({ message: 'isInfoFound', updating: true })).sponsorTimes.length).toBe(1);
    expect(await getMockVideoTime(page)).toBeLessThan(25);
    await writeSyncStorage(extensionServiceWorker, { manualSkipOnFullVideo: false });
    await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(50);
});

for (const option of [1, 2]) {
    test(`hidden notices retain Enter skip/undo for ${option === 1 ? 'manual' : 'automatic'} segments`, async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
        await setup({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }, {
            dontShowNotice: true, categorySelections: [{ name: 'sponsor', option }],
        }, [[10, 50]]);
        await setMockVideoTime(page, 12, true);
        if (option === 1) await page.keyboard.press('Enter');
        else await play(page);
        await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(50);
        await pauseMockVideo(page);
        await expect(page.locator(cards)).toHaveCount(0);
        await page.keyboard.press('Enter');
        await expect.poll(() => getMockVideoTime(page)).toBe(10);
        await play(page); await page.waitForTimeout(300); await pauseMockVideo(page);
        expect(await getMockVideoTime(page)).toBeLessThan(15);
        await expect(page.locator(cards)).toHaveCount(0);
    });
}

test('hidden Enter ignores text inputs, expires, and does not swallow player arrows', async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await setup({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }, { dontShowNotice: true, skipNoticeDuration: 2 }, [[10, 50]]);
    await setMockVideoTime(page, 12, true); await play(page);
    await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(50);
    await pauseMockVideo(page);
    await page.evaluate(() => { const input = document.createElement('input'); input.id = 'typing-test'; document.body.append(input); input.focus(); });
    await page.keyboard.press('Enter');
    expect(await getMockVideoTime(page)).toBeGreaterThanOrEqual(50);
    await page.locator('#typing-test').evaluate((input: HTMLInputElement) => input.blur());
    await page.waitForTimeout(2100);
    const time = await getMockVideoTime(page);
    await page.keyboard.press('Enter');
    expect(await getMockVideoTime(page)).toBe(time);
    const prevented = await page.evaluate(() => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true, cancelable: true });
        document.body.dispatchEvent(event); return event.defaultPrevented;
    });
    expect(prevented).toBe(false);
});

test('preview shortcut selects a recorded draft and allows submission', async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await setup({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage },
        { defaultCategory: 'sponsor', autoHideInfoButton: false, previewKeybind: { key: 'p', code: 'KeyP' } }, []);
    // Record instead of importing: imports already count as previewed.
    await setMockVideoTime(page, 10, true);
    await page.locator('#startSegmentButton').click();
    await expect(page.locator('#cancelSegmentButton')).toBeVisible();
    await setMockVideoTime(page, 20, true);
    await page.locator('#startSegmentButton').click();
    await expect(page.locator('#cancelSegmentButton')).toBeHidden();
    await expect(page.locator('#submitButton')).toBeVisible();
    await page.locator('#submitButton').click();
    const editor = page.locator('#submissionNoticeContainer');
    await expect(editor).toHaveCount(1);
    await page.keyboard.press('p');
    await expect.poll(() => getMockVideoTime(page)).toBeLessThan(10);
    await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(20);
    let submitted: { segments: Array<{ segment: number[] }> } | undefined;
    await extensionContext.route('https://www.bsbsb.top/api/skipSegments', async route => {
        submitted = route.request().postDataJSON();
        // Stop at the API boundary; never send a submission to the real server.
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const label = await extensionServiceWorker.evaluate(() => chrome.i18n.getMessage('submit'));
    await editor.getByRole('button', { name: label, exact: true }).click();
    await expect.poll(() => submitted?.segments[0]?.segment).toEqual([10, 20]);
    await expect(editor).toHaveCount(0);
});

test('Backspace dismisses every active fast-forward card and cancels only this pass', async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await setup({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage },
        { enableSpeedUp: true, speedUpPlaybackRate: 4 }, [[10, 90], [15, 100]]);
    await setMockVideoTime(page, 20, true); await play(page);
    await expect.poll(() => rate(page)).toBe(4);
    await expect(page.locator(cards)).toHaveCount(2);
    await page.keyboard.press('Backspace');
    await expect.poll(() => rate(page)).toBe(1);
    await expect(page.locator(cards)).toHaveCount(0);
    await setMockVideoTime(page, 30, true);
    await page.waitForTimeout(300);
    expect(await rate(page)).toBe(1);
    await expect(page.locator(cards)).toHaveCount(0);
    await setMockVideoTime(page, 5, true); await setMockVideoTime(page, 20, true);
    await expect.poll(() => rate(page)).toBe(4);
    await expect(page.locator(cards)).toHaveCount(2);
});

test('turning off fast-forward while paused restores speed without an automatic jump', async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await setup({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage },
        { enableSpeedUp: true, speedUpPlaybackRate: 4 }, [[10, 90]]);
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.playbackRate = 1.5; });
    await setMockVideoTime(page, 12, true); await play(page);
    await expect.poll(() => rate(page)).toBe(4);
    await pauseMockVideo(page);
    const position = await getMockVideoTime(page);
    await writeSyncStorage(extensionServiceWorker, { enableSpeedUp: false });
    await expect.poll(() => rate(page)).toBe(1.5);
    expect(await getMockVideoTime(page)).toBe(position);
    await play(page);
    await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(90);
});

for (const action of ['skip', 'mute']) test(`removing a paused ${action} segment releases its playback effect`, async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await setup({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage },
        { enableSpeedUp: true, speedUpPlaybackRate: 4, muteSegments: true }, [[10, 90]], [action]);
    const muted = () => page.locator('video').evaluate((v: HTMLVideoElement) => v.muted);
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.playbackRate = 1.5; v.muted = false; });
    await setMockVideoTime(page, 12, true); await play(page);
    if (action === 'skip') await expect.poll(() => rate(page)).toBe(4);
    else await expect.poll(muted).toBe(true);
    await pauseMockVideo(page);
    const position = await getMockVideoTime(page);
    await routeMockSponsorSegments(extensionContext, defaultMockBvid, []);
    await sendContentMessage({ message: 'refreshSegments' });
    await expect.poll(async () => (await sendContentMessage({ message: 'isInfoFound', updating: true })).sponsorTimes?.length).toBe(0);
    await expect.poll(() => rate(page)).toBe(1.5);
    await expect.poll(muted).toBe(false);
    expect(await getMockVideoTime(page)).toBe(position);
    await expect(page.locator(first)).toHaveCount(0);
});
