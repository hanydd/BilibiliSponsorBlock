import { expect, test } from './fixtures/extension';
import { defaultMockBvid, defaultMockCid, getMockVideoTime, pauseMockVideo, routeMockBilibiliVideoPage, setMockVideoTime } from './support/bilibiliPage';
import { writeSyncStorage } from './support/extensionStorage';
import { routeMockSponsorSegments } from './support/sponsorBlockApi';
import { waitForBilibiliContentScript } from './support/submissionNotice';

for (const actionType of ['skip', 'mute'] as const) {
    test(`preview upgrades in place with ${actionType === 'skip' ? 'separate cards for merged playback' : 'separate mute and seek actions'}`, async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
            if (/flushSync|unmount.*render|Maximum update depth/i.test(message.text())) errors.push(message.text());
        });
        await writeSyncStorage(extensionServiceWorker, {
            advanceSkipNotice: true, skipNoticeDurationBefore: 3, skipNoticeDuration: 60,
            noticeVisibilityMode: 2, muteSegments: true, skipOnSeekToSegment: true,
        });
        const segments = actionType === 'skip' ? [[5, 12], [8, 20]] : [[5, 20]];
        await routeMockSponsorSegments(extensionContext, defaultMockBvid, segments.map((segment, index) => ({
            segment: segment as [number, number], UUID: `action-${index}`, category: 'sponsor', actionType,
            cid: defaultMockCid, videoDuration: 120,
        })));
        await routeMockBilibiliVideoPage(page, { currentTime: 0, paused: false });
        await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
        await waitForBilibiliContentScript(page, sendContentMessage);
        const preview = page.locator('.sponsorSkipUpcomingNotice');
        await expect(preview).toHaveCount(1);
        const original = await preview.elementHandle();
        const results = page.locator('.sponsorSkipStackCard:not(.sponsorSkipUpcomingNotice)');
        await expect(results).toHaveCount(actionType === 'skip' ? 2 : 1);
        const result = results.filter({ has: page.locator('[id*="action-0"]') });
        await pauseMockVideo(page);
        expect(await original.evaluate(el => el.isConnected)).toBe(true);
        await result.locator('.sponsorSkipStackHeader').hover();
        const primary = result.locator('[id^="sponsorSkipUnskipButton"]').first();
        if (actionType === 'skip') {
            await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(20);
            await primary.click();
            await expect(result.locator('[id^="sponsorTimesSubmissionOptionsContainer"] button')).toHaveCount(0);
            await expect.poll(() => getMockVideoTime(page)).toBeCloseTo(5.001, 3);
        } else {
            await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
            await primary.click();
            await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.muted)).toBe(false);
            await primary.click();
            await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
            await result.locator('[id^="sponsorSkipUnskipButton"]').nth(1).click();
            await expect.poll(() => getMockVideoTime(page)).toBeGreaterThanOrEqual(20);
        }
        await result.locator('.sponsorSkipNoticeCloseButton').click();
        await expect(result).toHaveCount(0);
        if (actionType === 'skip') {
            await results.locator('.sponsorSkipNoticeCloseButton').click();
            await expect(results).toHaveCount(0);
        }
        await expect(page.locator('.sponsorSkipNoticeRoot')).toHaveCount(0);
        // A fully removed list must support a new playback session in the same player.
        await setMockVideoTime(page, 0, true);
        await page.locator('video').evaluate((v: HTMLVideoElement) => v.play());
        await expect(page.locator('.sponsorSkipUpcomingNotice')).toHaveCount(1);
        expect(errors).toEqual([]);
    });
}
