import { expect, test } from './fixtures/extension';
import { writeSyncStorage } from './support/extensionStorage';
import { openRealBilibiliPage } from './support/realBilibili';
import { routeMockSponsorSegments, type MockSponsorSegment } from './support/sponsorBlockApi';
import { waitForBilibiliContentScript } from './support/submissionNotice';

const bvid = 'BV1eier6bEbQ';
// Snapshot of this video's two opening segments, retrieved on 2026-09-25.
const segments: MockSponsorSegment[] = [
    { segment: [0, 8.133], category: 'intro', UUID: '6a8cf495bcd4859714d5b4bcf564032eecc136c30d516f3a3f1b5fe6bebb6d207', actionType: 'skip', cid: '41979872640', videoDuration: 794.683 },
    { segment: [8.133, 20.566], category: 'outro', UUID: '0f942ca22bd0aac2bb7265fff44b4d95f64e551ce2b4af356ba75efd3130068b7', actionType: 'skip', cid: '41979872640', videoDuration: 794.683 },
];

for (const speedup of [false, true]) {
    for (const [intro, outro] of [[2, 2], [1, 1], [2, 1], [1, 2]]) {
        test(`@real adjacent opening segments ${intro}-${outro}, speedup=${speedup}`, async ({
            extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage,
        }, testInfo) => {
            test.setTimeout(70_000);
            await writeSyncStorage(extensionServiceWorker, {
                enableSpeedUp: speedup, speedUpPlaybackRate: 4,
                categorySelections: [{ name: 'intro', option: intro }, { name: 'outro', option: outro }],
                // The extension's own skip must hand off independently of user-seek settings.
                skipOnSeekToSegment: false, noticeVisibilityMode: 2, skipNoticeDuration: 60,
                advanceSkipNotice: true, skipNoticeDurationBefore: 3,
                enableCache: false, trackViewCount: false, dontShowNotice: false,
                skipKeybind: { key: 'Enter' },
            });
            await routeMockSponsorSegments(extensionContext, bvid, segments);
            const errors: string[] = [];
            page.on('pageerror', error => {
                if (error.stack?.includes('chrome-extension://')) errors.push(error.stack);
            });
            const state = () => page.locator('video').evaluate((video: HTMLVideoElement) => ({
                time: video.currentTime, rate: video.playbackRate, paused: video.paused,
            }));
            const firstCard = page.locator(`.sponsorSkipStackCard[id*="${segments[0].UUID}"]`);
            const secondCard = page.locator(`.sponsorSkipStackCard[id*="${segments[1].UUID}"]`);
            try {
                await openRealBilibiliPage(page, testInfo, `https://www.bilibili.com/video/${bvid}/`);
                await waitForBilibiliContentScript(page, sendContentMessage);
                await expect.poll(async () => (await sendContentMessage<{ sponsorTimes?: unknown[] }>({
                    message: 'isInfoFound', updating: true,
                })).sponsorTimes?.length).toBe(2);
                // Bilibili can replace the initial media source while play() is pending.
                await expect.poll(async () => {
                    try {
                        await page.locator('video').evaluate(async (video: HTMLVideoElement) => {
                            video.muted = true;
                            await video.play();
                        });
                        return true;
                    } catch (error) {
                        if (String(error).includes('AbortError')) return false;
                        throw error;
                    }
                }, { timeout: 15_000 }).toBe(true);
                if (speedup && intro === 2 && outro === 2) {
                    await expect(firstCard).toHaveCount(1);
                    await expect(secondCard).toHaveCount(0);
                    const original = await firstCard.elementHandle();
                    await expect.poll(async () => (await state()).time, { timeout: 10_000 }).toBeGreaterThanOrEqual(8.133);
                    await expect(secondCard).toHaveCount(1);
                    await expect(firstCard.locator('[id^="sponsorSkipPauseSpeedUpButton"]')).toHaveCount(0);
                    await expect(secondCard.locator('[id^="sponsorSkipPauseSpeedUpButton"]')).toBeVisible();
                    expect(await original.evaluate(element => element.isConnected)).toBe(true);
                    expect((await state()).rate).toBe(4);
                }
                if (intro === 1) {
                    await expect(firstCard).toHaveCount(1);
                    expect((await state()).time).toBeLessThan(8.133);
                    await page.keyboard.press('Enter');
                }
                if (outro === 1) {
                    await expect.poll(async () => (await state()).time, { timeout: 15_000 }).toBeGreaterThanOrEqual(8.13);
                    await expect(secondCard).toHaveCount(1, { timeout: 5000 });
                    expect((await state()).time).toBeLessThan(20.566);
                    await expect(secondCard.locator('[id^="sponsorSkipUnskipButton"]').first()).toContainText('Enter');
                    await page.keyboard.press('Enter');
                }
                await expect.poll(async () => (await state()).time, { timeout: 18_000 }).toBeGreaterThanOrEqual(20.56);
                await expect.poll(async () => (await state()).rate).toBe(1);
                if (intro === 2 && outro === 2) {
                    await expect(firstCard).toHaveCount(1);
                    await expect(secondCard).toHaveCount(1);
                    await expect(page.locator('[id^="sponsorSkipPauseSpeedUpButton"]')).toHaveCount(0);
                }
                expect(errors).toEqual([]);
            } finally {
                await testInfo.attach('adjacent-playback', {
                    contentType: 'application/json',
                    body: Buffer.from(JSON.stringify({
                        intro, outro, speedup, state: await state(), errors,
                        logs: await sendContentMessage({ message: 'getLogs' }),
                    }, null, 2)),
                });
            }
        });
    }
}
