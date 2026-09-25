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

async function setup({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }, config = {}, ranges = [[10, 20], [20, 40]], actions: string[] = []) {
    await writeSyncStorage(extensionServiceWorker, {
        skipEngineMode: 'rules', enableSpeedUp: false, skipOnSeekToSegment: true, advanceSkipNotice: false,
        skipNoticeDuration: 8, noticeVisibilityMode: 2, dontShowNotice: false, trackViewCount: false,
        categorySelections: [{ name: 'sponsor', option: 2 }], ...config,
    });
    await routeMockSponsorSegments(extensionContext, defaultMockBvid, ranges.map((segment, i) => ({
        segment: segment as [number, number], UUID: `rules-${String.fromCharCode(65 + i)}`, category: 'sponsor',
        actionType: actions[i] || 'skip', cid: defaultMockCid, videoDuration: 120,
    })));
    await routeMockBilibiliVideoPage(page, { currentTime: 0, paused: true });
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);
    await expect.poll(async () => (await sendContentMessage({ message: 'isInfoFound', updating: true })).sponsorTimes?.length).toBe(ranges.length);
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
    const selector = page.locator('#skipEngineMode');
    await expect(selector).toHaveValue('legacy');
    await selector.selectOption('rules');
    await expect.poll(() => readSyncStorage(extensionServiceWorker, 'skipEngineMode')).toBe('rules');
    await selector.selectOption('legacy');
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
