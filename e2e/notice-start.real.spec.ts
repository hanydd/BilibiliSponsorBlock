import { test, expect } from './fixtures/extension';
import { writeSyncStorage } from './support/extensionStorage';
import { openRealBilibiliPage } from './support/realBilibili';
import { waitForBilibiliContentScript } from './support/submissionNotice';

// Keep Bilibili's player and media intact; only control the extension's segment response.
for (const mode of ['instant', 'speedup', 'manual']) {
    for (const start of [0, 0.2]) {
        test(`@real opening segment ${start}s ${mode}`, async ({
            extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage,
        }, testInfo) => {
            test.setTimeout(90_000);
            const bvid = 'BV1hUvpewEYD';
            await writeSyncStorage(extensionServiceWorker, {
                enableSpeedUp: mode === 'speedup', speedUpPlaybackRate: 4,
                noticeVisibilityMode: 2, skipNoticeDuration: 60,
                advanceSkipNotice: true, skipNoticeDurationBefore: 3,
                skipOnSeekToSegment: true, enableCache: false, trackViewCount: false,
                dontShowNotice: false, categorySelections: [{ name: 'sponsor', option: mode === 'manual' ? 1 : 2 }],
            });
            await extensionContext.route('https://www.bsbsb.top/**', async route => {
                if (!new URL(route.request().url()).pathname.startsWith('/api/skipSegments/')) {
                    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
                    return;
                }
                const data = await page.evaluate(() => ({
                    cid: String(window['player']?.getManifest()?.cid ?? window['__INITIAL_STATE__']?.cid),
                    duration: document.querySelector('video')?.duration,
                }));
                await route.fulfill({
                    status: 200, contentType: 'application/json',
                    body: JSON.stringify([{ videoID: bvid, segments: [{
                        segment: [start, 30], UUID: `opening-${mode}-${start}`, category: 'sponsor',
                        actionType: 'skip', cid: data.cid, videoDuration: data.duration || 259,
                    }] }]),
                });
            });
            const errors: string[] = [];
            page.on('pageerror', error => {
                if (error.stack?.includes('chrome-extension://')) errors.push(error.stack);
            });
            await page.addInitScript(() => {
                window['openingEvents'] = [];
                for (const name of ['play', 'playing', 'pause', 'seeking', 'seeked', 'ratechange']) {
                    document.addEventListener(name, event => {
                        if (event.target instanceof HTMLVideoElement) {
                            window['openingEvents'].push({
                                event: name, time: event.target.currentTime,
                                rate: event.target.playbackRate, paused: event.target.paused,
                            });
                        }
                    }, true);
                }
            });
            try {
                await openRealBilibiliPage(page, testInfo, `https://www.bilibili.com/video/${bvid}/`);
                await waitForBilibiliContentScript(page, sendContentMessage);
                await expect.poll(async () => (await sendContentMessage<{ sponsorTimes?: unknown[] }>({
                    message: 'isInfoFound', updating: true,
                })).sponsorTimes?.length).toBe(1);
                await page.locator('video').evaluate(async (video: HTMLVideoElement) => {
                    video.muted = true;
                    await video.play();
                });
                const card = page.locator('.sponsorSkipStackCard');
                await expect(card).toHaveCount(1);
                if (mode === 'instant') {
                    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(30);
                } else if (mode === 'speedup') {
                    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.playbackRate)).toBe(4);
                } else {
                    expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeLessThan(25);
                }
                await page.locator('video').evaluate((video: HTMLVideoElement) => video.pause());
                await card.locator('.sponsorSkipNoticeCloseButton').click();
                await expect(card).toHaveCount(0);
                await page.locator('video').evaluate((video: HTMLVideoElement) => { video.currentTime = 0; });
                await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.seeking)).toBe(false);
                await page.locator('video').evaluate((video: HTMLVideoElement) => video.play());
                await expect(card).toHaveCount(1);
                expect(errors).toEqual([]);
            } finally {
                await testInfo.attach('opening-playback', {
                    contentType: 'application/json',
                    body: Buffer.from(JSON.stringify({
                        errors, events: await page.evaluate(() => window['openingEvents']),
                        logs: await sendContentMessage({ message: 'getLogs' }),
                    }, null, 2)),
                });
            }
        });
    }
}
