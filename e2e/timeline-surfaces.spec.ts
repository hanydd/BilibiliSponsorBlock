import { test, expect } from './fixtures/extension';
import { defaultMockBvid, defaultMockCid, routeMockBilibiliVideoPage } from './support/bilibiliPage';
import { routeMockSponsorSegments } from './support/sponsorBlockApi';
import { writeSyncStorage } from './support/extensionStorage';
import { waitForBilibiliContentScript } from './support/submissionNotice';

test('segment colors follow page, mini, PiP video and audio tracks with live updates', async ({
    extensionContext: context, extensionPage: page, extensionServiceWorker: worker, sendContentMessage,
}) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await writeSyncStorage(worker, { disableSkipping: true, enableCache: false });
    const segments = [
        { segment: [10, 30] as [number, number], category: 'sponsor', actionType: 'skip' as const },
        { segment: [60, 60] as [number, number], category: 'poi_highlight', actionType: 'poi' as const },
        { segment: [180, 210] as [number, number], category: 'sponsor', actionType: 'skip' as const },
    ].map((segment, i) => ({ ...segment, UUID: `${i + 1}`.repeat(64), cid: defaultMockCid, videoDuration: 240 }));
    await routeMockSponsorSegments(context, defaultMockBvid, segments);
    await routeMockBilibiliVideoPage(page);
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);
    await sendContentMessage({ message: 'refreshSegments' });
    await expect(page.locator('#previewbar > li')).toHaveCount(2);
    await page.locator('.bpx-player-container').evaluate(player => {
        player.setAttribute('data-screen', 'mini');
        player.insertAdjacentHTML('beforeend', '<div class="bpx-player-mini-progress"></div>');
    });
    await expect(page.locator('#miniPreviewbar > li')).toHaveCount(2);

    for (let cycle = 0; cycle < 2; cycle++) {
        const popup = context.waitForEvent('page');
        await page.evaluate(async () => {
            const pip = await window['documentPictureInPicture'].requestWindow({ width: 480, height: 270 });
            for (const sheet of document.styleSheets) {
                const style = pip.document.createElement('style');
                style.textContent = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
                pip.document.head.append(style);
            }
            pip.document.body.innerHTML = `<div class="bpx-player-rich-pip-root">
                <span class="bpx-player-rich-pip-time-label">00:15 / 04:00</span>
                <div class="bpx-player-rich-pip-progress" style="position:relative;height:10px;width:400px;background:#555"></div>
                <div class="bpx-player-rich-pip-audio-progress" style="display:none;position:relative;height:10px;width:400px"></div></div>`;
            const area = document.querySelector('.bpx-player-video-area');
            const parent = area.parentElement;
            pip.document.querySelector('.bpx-player-rich-pip-root').prepend(area);
            // The adopted legacy bar is present but is not the PiP seek track.
            pip.document.querySelector('.bpx-player-control-wrap')?.setAttribute('style', 'display:none');
            pip.document.querySelector('.bpx-player-rich-pip-progress').addEventListener('click', (event: MouseEvent) => {
                const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                pip.document.querySelector('video').currentTime = (event.clientX - rect.x) / rect.width * 240;
            });
            pip.addEventListener('pagehide', () => {
                parent.prepend(area);
                area.querySelector('.bpx-player-control-wrap')?.removeAttribute('style');
            }, { once: true });
        });
        const pip = await popup;
        pip.on('pageerror', e => errors.push(e.message));
        await pip.setViewportSize({ width: 480, height: 700 });
        await pip.bringToFront();
        await expect(pip.locator('#pipPreviewbar > li')).toHaveCount(3);
        await expect(pip.locator('#pipAudioPreviewbar > li')).toHaveCount(3);
        await expect(pip.locator('#previewbar')).toHaveCount(0);
        const mark = pip.locator('#pipPreviewbar [sponsorblock-category="poi_highlight"]');
        await expect.poll(() => mark.evaluate((el: HTMLElement) => parseFloat(el.style.left))).toBe(25);
        await expect(pip.locator('#pipPreviewbar')).toHaveCSS('pointer-events', 'none');
        await pip.locator('.bpx-player-rich-pip-progress').click({ position: { x: 100, y: 5 } });
        await expect.poll(() => pip.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(60);
        await writeSyncStorage(worker, { barTypes: { sponsor: { color: '#ff00ff', opacity: '0.7' } } });
        await expect(pip.locator('#pipPreviewbar [sponsorblock-category="sponsor"]').first()).toHaveCSS('background-color', 'rgb(255, 0, 255)');
        await expect(pip.locator('#pipPreviewbar [sponsorblock-category="sponsor"]').first()).toHaveCSS('opacity', '0.7');
        await pip.locator('.bpx-player-rich-pip-audio-progress').evaluate(el => {
            const replacement = el.cloneNode(false) as HTMLElement;
            replacement.style.display = 'block'; el.replaceWith(replacement);
        });
        await expect(pip.locator('#pipAudioPreviewbar > li')).toHaveCount(3);
        await expect(pip.locator('#pipAudioPreviewbar [sponsorblock-category="sponsor"]').first()).toHaveCSS('background-color', 'rgb(255, 0, 255)');
        await pip.locator('.bpx-player-rich-pip-time-label').evaluate(el => { el.textContent = '01:00 / 02:00'; });
        await expect(pip.locator('#pipPreviewbar > li')).toHaveCount(2);
        await expect.poll(() => mark.evaluate((el: HTMLElement) => parseFloat(el.style.left))).toBe(50);
        await page.evaluate(() => window['documentPictureInPicture'].window.close());
        await page.bringToFront();
        await expect(page.locator('#previewbar')).toHaveCount(1);
        await expect(page.locator('#previewbar > li')).toHaveCount(2);
        await expect(page.locator('#miniPreviewbar > li')).toHaveCount(2);
    }
    await routeMockSponsorSegments(context, defaultMockBvid, []);
    await sendContentMessage({ message: 'refreshSegments' });
    await expect(page.locator('.sbSegmentOverlay > li')).toHaveCount(0);
    expect(errors).toEqual([]);
});
