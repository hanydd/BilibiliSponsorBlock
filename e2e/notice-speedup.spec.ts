import { expect, test } from './fixtures/extension';
import { defaultMockBvid, defaultMockCid, getMockVideoTime, pauseMockVideo, routeMockBilibiliVideoPage, setMockVideoTime } from './support/bilibiliPage';
import { readSyncStorage, writeSyncStorage } from './support/extensionStorage';
import { routeMockSponsorSegments } from './support/sponsorBlockApi';
import { waitForBilibiliContentScript } from './support/submissionNotice';

for (const mode of [0, 2]) {
    test(`preview and speed-up controls share one card in mode ${mode}`, async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
        await writeSyncStorage(extensionServiceWorker, {
            enableSpeedUp: true, speedUpPlaybackRate: 4, skipNoticeDuration: 5, noticeVisibilityMode: mode,
            advanceSkipNotice: true, skipNoticeDurationBefore: 3, skipOnSeekToSegment: true,
        });
        await routeMockSponsorSegments(extensionContext, defaultMockBvid, [{
            segment: [10, 50], UUID: 'speedup-controls', category: 'sponsor', actionType: 'skip', cid: defaultMockCid, videoDuration: 120,
        }]);
        await routeMockBilibiliVideoPage(page, { currentTime: 6, paused: false });
        await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
        await waitForBilibiliContentScript(page, sendContentMessage);
        const card = page.locator('.sponsorSkipStackCard');
        await expect(card).toHaveClass(/sponsorSkipUpcomingNotice/);
        const original = await card.elementHandle();
        await expect(card).not.toHaveClass(/sponsorSkipUpcomingNotice/);
        const rate = () => page.locator('video').evaluate((video: HTMLVideoElement) => video.playbackRate);
        await expect.poll(rate).toBe(4);
        const control = card.locator('[id^="sponsorSkipPauseSpeedUpButton"]');
        await expect(control).toBeVisible();
        await control.click();
        await expect.poll(rate).toBe(1);
        await card.locator('.sponsorSkipNoticeTimeLeft').click();
        await page.mouse.move(1200, 700);
        await expect(card.locator('[id^="skipNoticeTimerStopped"]')).toBeVisible();
        await page.waitForTimeout(1200);
        await control.click();
        await expect.poll(rate).toBe(4);
        await expect(card.locator('[id^="skipNoticeTimerStopped"]')).toBeVisible();
        await pauseMockVideo(page);
        await card.locator('.sponsorSkipNoticeTimeLeft').click();
        await page.mouse.move(1200, 700);
        await expect(card.locator('[id^="skipNoticeTimerPaused"]')).toBeVisible();
        await page.waitForTimeout(200);
        const remaining = await card.locator('[id^="skipNoticeTimerText"]').textContent();
        await page.waitForTimeout(1300);
        await expect(card.locator('[id^="skipNoticeTimerText"]')).toHaveText(remaining);
        await page.locator('video').evaluate((video: HTMLVideoElement) => video.play());
        await expect.poll(rate).toBe(4);
        await card.locator('[id^="sponsorSkipUnskipButton"]').first().click();
        await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(50);
        await expect.poll(rate).toBe(1);
        await expect(control).toHaveCount(0);
        expect(await original.evaluate(element => element === document.querySelector('.sponsorSkipStackCard'))).toBe(true);
    });
}

test('replay restores the speed-up notice, preserves statistics deduplication and respects hidden notices', async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await writeSyncStorage(extensionServiceWorker, {
        enableSpeedUp: true, speedUpPlaybackRate: 4, skipOnSeekToSegment: true,
        advanceSkipNotice: false, skipNoticeDuration: 2, noticeVisibilityMode: 2, skipCount: 0,
    });
    await routeMockSponsorSegments(extensionContext, defaultMockBvid, [{
        segment: [5, 13], UUID: 'speedup-replay', category: 'sponsor', actionType: 'skip', cid: defaultMockCid, videoDuration: 120,
    }]);
    await routeMockBilibiliVideoPage(page, { currentTime: 0, paused: true });
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);
    await expect.poll(async () => (await sendContentMessage<{ sponsorTimes?: unknown[] }>({ message: 'isInfoFound', updating: false })).sponsorTimes?.length).toBe(1);
    const card = page.locator('.sponsorSkipStackCard');
    const rate = () => page.locator('video').evaluate((video: HTMLVideoElement) => video.playbackRate);
    for (let pass = 0; pass < 2; pass++) {
        await pauseMockVideo(page);
        await setMockVideoTime(page, 4, true);
        await page.locator('video').evaluate((video: HTMLVideoElement) => video.play());
        await expect.poll(rate).toBe(4);
        await expect(card.locator('[id^="sponsorSkipPauseSpeedUpButton"]')).toBeVisible();
        await expect.poll(() => getMockVideoTime(page)).toBeGreaterThan(13);
        await expect(card).toHaveCount(0);
        await expect.poll(rate).toBe(1);
        await expect.poll(() => readSyncStorage<number>(extensionServiceWorker, 'skipCount')).toBe(1);
    }
    await writeSyncStorage(extensionServiceWorker, { dontShowNotice: true });
    await pauseMockVideo(page);
    await setMockVideoTime(page, 4, true);
    await page.locator('video').evaluate((video: HTMLVideoElement) => video.play());
    await expect.poll(rate).toBe(4);
    await expect(card).toHaveCount(0);
});

test('adjacent speed-up cards hand off, retain hover countdown and allow immediate skipping', async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await writeSyncStorage(extensionServiceWorker, {
        enableSpeedUp: true, speedUpPlaybackRate: 4, skipNoticeDuration: 2,
        noticeVisibilityMode: 2, advanceSkipNotice: false, skipOnSeekToSegment: true,
    });
    await routeMockSponsorSegments(extensionContext, defaultMockBvid, [
        { segment: [2, 6], UUID: 'continuous-first', category: 'sponsor', actionType: 'skip', cid: defaultMockCid, videoDuration: 120 },
        { segment: [6, 60], UUID: 'continuous-second', category: 'sponsor', actionType: 'skip', cid: defaultMockCid, videoDuration: 120 },
    ]);
    await routeMockBilibiliVideoPage(page, { currentTime: 0, paused: true });
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);
    await expect.poll(async () => (await sendContentMessage<{ sponsorTimes?: unknown[] }>({ message: 'isInfoFound', updating: true })).sponsorTimes?.length).toBe(2);
    await page.locator('video').evaluate((video: HTMLVideoElement) => video.play());
    const first = page.locator('.sponsorSkipStackCard[id*="continuous-first"]');
    const second = page.locator('.sponsorSkipStackCard[id*="continuous-second"]');
    await expect(first).toHaveCount(1);
    await expect(second).toHaveCount(0);
    const original = await first.elementHandle();
    await first.hover();
    await expect(second).toHaveCount(1);
    await expect(first.locator('[id^="sponsorSkipPauseSpeedUpButton"]')).toHaveCount(0);
    await expect(second.locator('[id^="sponsorSkipPauseSpeedUpButton"]')).toBeVisible();
    expect(await original.evaluate(element => element.isConnected)).toBe(true);
    await page.waitForTimeout(2500);
    await expect(first).toHaveCount(1);
    await page.mouse.move(1200, 700);
    await expect(first).toHaveCount(0, { timeout: 4000 });
    await expect(second).toHaveCount(1);
    await second.locator('[id^="sponsorSkipUnskipButton"]').first().click();
    await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(60);
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.playbackRate)).toBe(1);
    await expect(second.locator('[id^="sponsorSkipPauseSpeedUpButton"]')).toHaveCount(0);
    await expect(second).toHaveCount(1);
});
