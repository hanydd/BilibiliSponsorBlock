import { test, expect } from './fixtures/extension';
import { writeSyncStorage } from './support/extensionStorage';
import { waitForBilibiliContentScript } from './support/submissionNotice';
import { openRealBilibiliPage } from './support/realBilibili';
import { routeMockSponsorSegments } from './support/sponsorBlockApi';

for (const engine of ['legacy', 'rules']) {
    test(`@real ${engine}: notices and skipping survive Bilibili document PiP`, async ({
        extensionContext: context, extensionPage: page, extensionServiceWorker: worker, sendContentMessage,
    }, info) => {
        test.setTimeout(90_000);
        const errors: string[] = [];
        const collectError = (error: Error) => { if (error.stack?.includes('chrome-extension://')) errors.push(error.stack); };
        page.on('pageerror', collectError);
        await writeSyncStorage(worker, {
            skipEngineMode: engine, skipOnSeekToSegment: true, skipNoticeDuration: 60, advanceSkipNotice: false,
            dontShowNotice: false, enableCache: false, trackViewCount: false, skipKeybind: { key: 'Enter' },
            categorySelections: [{ name: 'sponsor', option: 2 }],
        });
        await openRealBilibiliPage(page, info, 'https://www.bilibili.com/video/BV1hUvpewEYD/');
        const identity = await waitForBilibiliContentScript(page, sendContentMessage);
        const [bvid, cid] = identity.videoID!.split('+');
        await page.locator('video').first().evaluate((v: HTMLVideoElement) => { v.muted = true; v.pause(); v.currentTime = 1; });
        const duration = await page.locator('video').first().evaluate((v: HTMLVideoElement) => v.duration);
        await routeMockSponsorSegments(context, bvid, [10, 30].map((start, index) => ({
            segment: [start, start + 10], UUID: String(index + 1).repeat(64), category: 'sponsor',
            actionType: 'skip', cid, videoDuration: duration,
        })));
        await sendContentMessage({ message: 'refreshSegments' });
        await expect.poll(async () => (await sendContentMessage<{ sponsorTimes?: unknown[] }>({ message: 'isInfoFound', updating: false })).sponsorTimes?.length).toBe(2);
        await page.locator('video').first().evaluate(async (v: HTMLVideoElement) => { v.currentTime = 11; await v.play(); });
        await expect.poll(() => page.locator('video').first().evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(20);
        const card = page.locator('.sponsorSkipStackCard');
        await expect(card).toHaveCount(1);
        const firstId = await card.getAttribute('id');
        await page.locator('video').first().evaluate((v: HTMLVideoElement) => v.pause());

        // Select the site's shipped RichPip implementation even outside its rollout cohort.
        // Do not replace the player, its window creation, DOM adoption or stylesheet copying.
        await page.evaluate(() => {
            const w = window as Window & { webAbTest?: Record<string, unknown> };
            w.webAbTest = { ...w.webAbTest, new_pip: '1' };
        });
        const openPip = async () => {
            await page.locator('.bpx-player-container').hover();
            await page.locator('.bpx-player-ctrl-pip').hover();
            const popupPromise = context.waitForEvent('page');
            await page.locator('.bpx-player-ctrl-pip').click();
            const pip = await popupPromise;
            pip.on('pageerror', collectError);
            await pip.waitForLoadState('domcontentloaded');
            await pip.setViewportSize({ width: 480, height: 270 });
            await pip.bringToFront();
            return pip;
        };
        const pip = await openPip();
        await expect(pip.locator('.sponsorSkipStackCard')).toHaveAttribute('id', firstId);
        await expect(pip.locator('.sponsorSkipStack')).toHaveCSS('position', 'absolute');
        await expect(pip.locator('.sponsorSkipStackCard')).toHaveCSS('height', '34px');
        await expect.poll(() => pip.locator('video').first().evaluate(v => v.getBoundingClientRect().y)).toBe(0);
        await pip.screenshot({ path: info.outputPath('pip-existing-notice.png') });

        await pip.locator('video').first().evaluate(async (v: HTMLVideoElement) => { v.currentTime = 31; await v.play(); });
        await expect.poll(() => pip.locator('video').first().evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(40);
        await pip.locator('video').first().evaluate((v: HTMLVideoElement) => v.pause());
        const nextCard = pip.locator(`.sponsorSkipStackCard[id*="${'2'.repeat(64)}"]`);
        await expect(nextCard).toBeVisible();
        await pip.mouse.move(0, 0);
        await pip.keyboard.press('Enter');
        await expect.poll(() => pip.locator('video').first().evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(engine === 'rules' ? 30 : 30.001, 3);
        await pip.keyboard.press('Enter');
        await expect.poll(() => pip.locator('video').first().evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(40);
        await pip.screenshot({ path: info.outputPath('pip-new-notice.png') });
        const nextId = await nextCard.getAttribute('id');
        await page.evaluate(() => window['documentPictureInPicture'].window.close());
        await expect(page.locator(`[id="${nextId}"]`)).toBeVisible();
        await expect(page.locator('[data-sb-player-surface]')).toHaveCount(0);

        const reopened = await openPip();
        await expect(reopened.locator('[data-sb-player-surface]')).toHaveCount(1);
        await expect(reopened.locator(`[id="${nextId}"]`)).toHaveCSS('height', '34px');
        await reopened.locator(`[id="${nextId}"] .sponsorSkipNoticeCloseButton`).click({ timeout: 5000 });
        await expect(reopened.locator(`[id="${nextId}"]`)).toHaveCount(0);
        await page.evaluate(() => window['documentPictureInPicture'].window.close());
        await expect(page.locator('#bsbPlayerButtonContainer')).toHaveCount(1);
        await expect(page.locator('#previewbar')).toHaveCount(1);
        expect(errors).toEqual([]);
    });
}
