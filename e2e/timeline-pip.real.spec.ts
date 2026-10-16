import { test, expect } from './fixtures/extension';
import { writeSyncStorage } from './support/extensionStorage';
import { waitForBilibiliContentScript } from './support/submissionNotice';
import { openRealBilibiliPage } from './support/realBilibili';
import { routeMockSponsorSegments } from './support/sponsorBlockApi';

test('@real segment colors and native seeking survive Bilibili document PiP', async ({
    extensionContext: context, extensionPage: page, extensionServiceWorker: worker, sendContentMessage,
}, info) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    const collect = (e: Error) => { if (e.stack?.includes('chrome-extension://')) errors.push(e.message); };
    page.on('pageerror', collect);
    await writeSyncStorage(worker, { disableSkipping: true, enableCache: false, trackViewCount: false });
    await openRealBilibiliPage(page, info, 'https://www.bilibili.com/video/BV1hUvpewEYD/');
    const identity = await waitForBilibiliContentScript(page, sendContentMessage);
    const [bvid, cid] = identity.videoID!.split('+');
    await expect.poll(() => page.locator('video').first().evaluate((v: HTMLVideoElement) => v.duration)).toBeGreaterThan(60);
    const duration = await page.locator('video').first().evaluate((v: HTMLVideoElement) => {
        v.muted = true; v.pause(); v.currentTime = 1; return v.duration;
    });
    await routeMockSponsorSegments(context, bvid, [{ segment: [20, 60] as [number, number], UUID: '1'.repeat(64),
        category: 'sponsor', actionType: 'skip', cid, videoDuration: duration }]);
    await sendContentMessage({ message: 'refreshSegments' });
    await expect(page.locator('#previewbar > li')).toHaveCount(1);
    // Select the site's existing RichPiP rollout; use its actual DOM and interactions.
    await page.evaluate(() => { window['webAbTest'] = { ...window['webAbTest'], new_pip: '1' }; });
    for (let cycle = 0; cycle < 2; cycle++) {
        await page.locator('.bpx-player-container').hover();
        await page.locator('.bpx-player-ctrl-pip').hover();
        const popup = context.waitForEvent('page');
        await page.locator('.bpx-player-ctrl-pip').click();
        const pip = await popup;
        pip.on('pageerror', collect);
        await pip.waitForLoadState('domcontentloaded');
        await pip.setViewportSize(cycle === 0 ? { width: 480, height: 270 } : { width: 320, height: 180 });
        await pip.bringToFront();
        const track = pip.locator('.bpx-player-rich-pip-progress');
        const marker = pip.locator('#pipPreviewbar > li');
        await expect(marker).toHaveCount(1);
        await expect(pip.locator('#pipAudioPreviewbar > li')).toHaveCount(1);
        await expect(pip.locator('#previewbar')).toHaveCount(0);
        await pip.locator('.bpx-player-rich-pip-root').hover();
        await expect(marker).toBeVisible();
        const axisDuration = await pip.locator('video').first().evaluate((v: HTMLVideoElement) => { v.pause(); return v.duration; });
        await expect(pip.locator('#pipPreviewbar')).toHaveCSS('pointer-events', 'none');
        await expect.poll(() => marker.evaluate((el: HTMLElement) => parseFloat(el.style.left))).toBeCloseTo(20 / axisDuration * 100, 3);
        const bounds = await track.boundingBox();
        const markerBounds = await marker.boundingBox();
        expect(markerBounds.width).toBeCloseTo(bounds.width * 40 / axisDuration, 0);
        expect(markerBounds.height).toBeGreaterThan(0);
        await writeSyncStorage(worker, { barTypes: { sponsor: { color: '#ff00ff', opacity: '0.7' } } });
        await expect(marker).toHaveCSS('background-color', 'rgb(255, 0, 255)');
        // Click inside the colored segment: the site's native seek handler must receive it.
        await pip.mouse.click(bounds.x + bounds.width * 40 / axisDuration, bounds.y + bounds.height / 2);
        await expect.poll(() => pip.locator('video').first().evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(40, 0);
        await pip.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height / 2);
        await expect(pip.locator('.bpx-player-rich-pip-progress-hover')).toBeVisible();
        await pip.mouse.down();
        await pip.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height / 2, { steps: 6 });
        await pip.mouse.up();
        await expect.poll(() => pip.locator('video').first().evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(axisDuration * 0.6, 0);
        await pip.screenshot({ path: info.outputPath(`pip-colored-${cycle}.png`) });
        await page.evaluate(() => window['documentPictureInPicture'].window.close());
        await page.bringToFront();
        await expect(page.locator('#previewbar > li')).toHaveCount(1);
        await expect(page.locator('#previewbar > li')).toHaveCSS('background-color', 'rgb(255, 0, 255)');
        await expect(page.locator('#previewbar')).toHaveCount(1);
    }
    expect(errors).toEqual([]);
});
