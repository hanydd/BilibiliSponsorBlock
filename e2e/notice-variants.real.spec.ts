import { expect, test } from './fixtures/extension';
import { writeSyncStorage } from './support/extensionStorage';
import { openRealBilibiliPage } from './support/realBilibili';
import { waitForBilibiliContentScript } from './support/submissionNotice';
import { expectNoticeContentColumn } from './support/noticeLayout';

for (const engine of ['legacy', 'rules']) {
    // The rule engine navigates to highlights without projecting a notice card.
    const variants = ['automatic', 'upcoming', 'speedup', 'mute', ...(engine === 'legacy' ? ['highlight'] : [])];
    for (const variant of variants) {
        test(`@real notice column ${engine} ${variant}`, async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }, testInfo) => {
            test.setTimeout(90_000);
            const bvid = 'BV1hUvpewEYD';
            const highlight = variant === 'highlight';
            const category = highlight ? 'poi_highlight' : 'sponsor';
            await writeSyncStorage(extensionServiceWorker, {
                skipEngineMode: engine, noticeVisibilityMode: 0, skipNoticeDuration: 300,
                advanceSkipNotice: variant === 'upcoming', skipNoticeDurationBefore: 5,
                enableSpeedUp: variant === 'speedup', speedUpPlaybackRate: 4, muteSegments: true,
                skipOnSeekToSegment: true, enableCache: false, trackViewCount: false,
                dontShowNotice: false, hideSkipButtonPlayerControls: false,
                categorySelections: [{ name: category, option: highlight ? 1 : 2 }],
            });
            // Keep the real page/player; only supply deterministic extension API responses.
            await extensionContext.route('https://www.bsbsb.top/api/skipSegments/**', async route => {
                const data = await page.evaluate(() => ({
                    cid: String(window['player']?.getManifest()?.cid ?? window['__INITIAL_STATE__']?.cid),
                    duration: document.querySelector('video')?.duration,
                }));
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
                    videoID: bvid, segments: [{ segment: highlight ? [30, 30] : [20, variant === 'speedup' ? 220 : 60], UUID: 'column', category,
                        actionType: highlight ? 'poi' : variant === 'mute' ? 'mute' : 'skip',
                        cid: data.cid, videoDuration: data.duration || 259 }],
                }]) });
            });
            await openRealBilibiliPage(page, testInfo, `https://www.bilibili.com/video/${bvid}/`);
            await waitForBilibiliContentScript(page, sendContentMessage);
            await expect.poll(async () => (await sendContentMessage<{ sponsorTimes?: unknown[] }>({ message: 'isInfoFound', updating: true })).sponsorTimes?.length).toBe(1);
            await expect.poll(async () => {
                try {
                    await page.locator('video').evaluate(async (video: HTMLVideoElement, time) => {
                        video.muted = true;
                        video.currentTime = time;
                        await video.play();
                    }, variant === 'upcoming' ? 16 : highlight ? 5 : 18.5);
                    return true;
                } catch (error) {
                    if (String(error).includes('AbortError')) return false;
                    throw error;
                }
            }).toBe(true);
            if (highlight) await page.locator('.skipButtonControlBarContainer').click();
            const card = page.locator('.sponsorSkipStackCard');
            await expect(card).toHaveCount(1);
            if (variant === 'automatic') await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(60);
            if (variant === 'speedup') await expect(card.locator('[id^="sponsorSkipPauseSpeedUpButton"]')).toBeVisible();
            if (variant !== 'speedup') await page.locator('video').evaluate((video: HTMLVideoElement) => video.pause());
            if (variant === 'upcoming') await expect(card).toHaveClass(/sponsorSkipUpcomingNotice/);
            if (variant === 'mute') await expect(card.locator('[id^="sponsorSkipUnskipButton"]')).toHaveCount(2);

            for (const [size, width, height] of [['normal', 960, 540], ['compact', 480, 270], ['narrow', 320, 180]] as const) {
                await page.locator('#bilibili-player').evaluate((el: HTMLElement, dimensions) => {
                    el.style.width = `${dimensions[0]}px`;
                    el.style.height = `${dimensions[1]}px`;
                }, [width, height]);
                await page.evaluate(() => window.scrollTo(0, 0));
                await expect(card).toHaveAttribute('aria-expanded', 'true');
                await expectNoticeContentColumn(card);
                await card.locator('.voteButton').nth(2).click();
                await expect(card.locator('[id^="sponsorSkipNoticeEditSegmentsRow"]')).toBeVisible();
                await expectNoticeContentColumn(card);
                await card.locator('.sponsorSkipNoticeTableContainer').screenshot({ path: testInfo.outputPath(`${size}-edit.png`) });
                await card.locator('[id^="sponsorSkipNoticeEditSegmentsRow"] button').nth(1).click();
                await expect(card.locator('select.sponsorTimeCategories')).toBeVisible();
                await expectNoticeContentColumn(card);
                await card.locator('.sponsorSkipNoticeTableContainer').screenshot({ path: testInfo.outputPath(`${size}-category.png`) });
                // Voting is intercepted by the fixture and never reaches the public server.
                await card.locator('[id^="sponsorSkipNoticeCategoryChooserRow"] button').click();
                const continueVoting = card.locator('[id^="sponsorTimesContinueVotingContainer"]');
                await expect(continueVoting).toBeVisible();
                await expectNoticeContentColumn(card);
                await card.locator('.sponsorSkipNoticeTableContainer').screenshot({ path: testInfo.outputPath(`${size}-feedback.png`) });
                await continueVoting.click();
            }
            if (variant === 'speedup') {
                await card.locator('[id^="sponsorSkipPauseSpeedUpButton"]').click();
                await expectNoticeContentColumn(card);
                await card.locator('.sponsorSkipNoticeTableContainer').screenshot({ path: testInfo.outputPath('narrow-speed-paused.png') });
                await card.locator('[id^="sponsorSkipPauseSpeedUpButton"]').click();
                await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.playbackRate)).toBe(4);
            }
        });
    }
}
