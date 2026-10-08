import { expect, test } from './fixtures/extension';
import { writeSyncStorage } from './support/extensionStorage';
import { openRealBilibiliPage } from './support/realBilibili';
import { waitForBilibiliContentScript } from './support/submissionNotice';

test('@real notice card vertical spacing', async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }, testInfo) => {
    test.setTimeout(90_000);
    const bvid = 'BV1hUvpewEYD';
    await writeSyncStorage(extensionServiceWorker, {
        noticeVisibilityMode: 0, skipNoticeDuration: 60, advanceSkipNotice: false,
        skipOnSeekToSegment: true, enableCache: false, trackViewCount: false,
        dontShowNotice: false, categorySelections: [{ name: 'sponsor', option: 1 }],
    });
    await extensionContext.route('https://www.bsbsb.top/api/skipSegments/**', async route => {
        const data = await page.evaluate(() => ({
            cid: String(window['player']?.getManifest()?.cid ?? window['__INITIAL_STATE__']?.cid),
            duration: document.querySelector('video')?.duration,
        }));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
            videoID: bvid, segments: [{ segment: [0, 60], UUID: 'spacing', category: 'sponsor',
                actionType: 'skip', cid: data.cid, videoDuration: data.duration || 259 }],
        }]) });
    });
    await openRealBilibiliPage(page, testInfo, `https://www.bilibili.com/video/${bvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);
    await expect.poll(async () => (await sendContentMessage<{ sponsorTimes?: unknown[] }>({ message: 'isInfoFound', updating: true })).sponsorTimes?.length).toBe(1);
    await page.locator('video').evaluate(async (video: HTMLVideoElement) => { video.muted = true; await video.play(); });
    const card = page.locator('.sponsorSkipStackCard');
    await expect(card).toHaveCount(1);
    await page.locator('video').evaluate((video: HTMLVideoElement) => video.pause());
    await card.locator('.sponsorSkipNoticeTimeLeft').click();
    await card.locator('.voteButton').nth(2).click();
    await expect(card.locator('[id^="sponsorSkipNoticeEditSegmentsRow"]')).toBeVisible();
    await page.mouse.move(0, 0);
    for (const size of ['normal', 'compact']) {
        if (size === 'compact') {
            await page.locator('#bilibili-player').evaluate((el: HTMLElement) => {
                el.style.width = '480px';
                el.style.height = '270px';
            });
            await expect(page.locator('.sponsorSkipStack')).toHaveClass(/sponsorSkipStackCompact/);
        }
        await expect.poll(() => card.evaluate(el => el.getAnimations({ subtree: true })
            .filter(animation => animation.playState === 'running').length)).toBe(0);
        const spacing = await card.evaluate(el => {
            const rect = (selector: string) => el.querySelector(selector).getBoundingClientRect();
            const center = (selector: string) => { const r = rect(selector); return r.y + r.height / 2; };
            const title = center('.sponsorSkipMessage');
            const vote = center('.voteButton svg');
            const edit = center('[id^="sponsorSkipNoticeEditSegmentsRow"] button');
            return {
                titleToVote: vote - title,
                voteToEdit: edit - vote,
                bottomPadding: rect('.sponsorSkipNoticeTableContainer').bottom - rect('[id^="sponsorSkipNoticeEditSegmentsRow"]').bottom,
            };
        });
        // Check the actual rendered controls, including Bilibili's CSS and SVG baselines.
        expect(Math.abs(spacing.titleToVote - spacing.voteToEdit)).toBeLessThanOrEqual(3);
        expect(spacing.titleToVote).toBeGreaterThan(20);
        expect(spacing.titleToVote).toBeLessThanOrEqual(31);
        expect(spacing.bottomPadding).toBeGreaterThanOrEqual(8);
        for (const button of await card.locator('[id^="sponsorSkipNoticeEditSegmentsRow"] button').all()) {
            expect(await button.evaluate(el => {
                const r = el.getBoundingClientRect();
                return el.contains(document.elementFromPoint(r.x + r.width / 2, r.bottom - 1));
            })).toBe(true);
        }
        await testInfo.attach(`${size}-spacing`, { body: JSON.stringify(spacing), contentType: 'application/json' });
        await page.screenshot({ path: testInfo.outputPath(`${size}-bilibili-page.png`) });
        await card.locator('.sponsorSkipNoticeTableContainer').screenshot({ path: testInfo.outputPath(`${size}-card.png`) });
    }
});
