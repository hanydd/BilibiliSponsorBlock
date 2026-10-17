import { test, expect } from './fixtures/extension';
import { defaultMockBvid, routeMockBilibiliVideoPage } from './support/bilibiliPage';
import { waitForBilibiliContentScript } from './support/submissionNotice';

test('reinjecting content into an open document PiP transfers styles without an observer loop', async ({
    extensionContext: context, extensionPage: page, extensionServiceWorker: worker, sendContentMessage,
}) => {
    await routeMockBilibiliVideoPage(page);
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);
    const popup = context.waitForEvent('page');
    await page.evaluate(async () => {
        const pip = await window['documentPictureInPicture'].requestWindow({ width: 480, height: 270 });
        const area = document.querySelector('.bpx-player-video-area');
        const parent = area.parentElement;
        pip.document.body.innerHTML = '<div class="bpx-player-rich-pip-root"><div class="bpx-player-rich-pip-progress"></div></div>';
        pip.document.querySelector('.bpx-player-rich-pip-root').prepend(area);
        pip.addEventListener('pagehide', () => parent.prepend(area), { once: true });
    });
    const pip = await popup;
    const styles = pip.locator('style[data-sb-player-surface]');
    await expect(styles).toHaveCount(1);
    const original = await styles.elementHandle();
    const oldOwner = await styles.getAttribute('data-sb-player-surface');
    await pip.evaluate(() => {
        window['removedSurfaceStyles'] = 0;
        new MutationObserver(records => {
            // Moving the style after a new palette sheet is a remove/add pair.
            const added = new Set(records.flatMap(record => [...record.addedNodes]));
            for (const record of records) for (const node of record.removedNodes) {
                if (node instanceof Element && node.matches('style[data-sb-player-surface]') && !added.has(node)) {
                    window['removedSurfaceStyles']++;
                }
            }
        }).observe(document.head, { childList: true });
    });
    // The production cleanup listener deliberately ignores instances under five seconds old.
    await page.waitForTimeout(5500);
    await worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: 'https://www.bilibili.com/video/*' });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['js/content.js'] });
    });
    await expect(styles).not.toHaveAttribute('data-sb-player-surface', oldOwner);
    // Crossing a task boundary proves queued cleanup and timers can run after reinjection.
    await pip.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 100)));
    await expect(styles).toHaveCount(1);
    expect(await original.evaluate(node => node.isConnected)).toBe(true);
    expect(await pip.evaluate(() => window['removedSurfaceStyles'])).toBe(0);
    await expect(pip.locator('#pipPreviewbar')).toHaveCSS('pointer-events', 'none');
    // The new owner still keeps extension CSS after later site stylesheet copies.
    await pip.addStyleTag({ content: '.sbSegmentOverlay { pointer-events: auto; }' });
    await expect(pip.locator('#pipPreviewbar')).toHaveCSS('pointer-events', 'none');
    expect(await original.evaluate(node => node === node.ownerDocument.head.lastChild)).toBe(true);
    await page.evaluate(() => window['documentPictureInPicture'].window.close());
    await expect(page.locator('#previewbar')).toHaveCount(1);
});
