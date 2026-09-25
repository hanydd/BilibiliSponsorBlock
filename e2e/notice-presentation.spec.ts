import { expect, test } from './fixtures/extension';
import { defaultMockBvid, defaultMockCid, pauseMockVideo, routeMockBilibiliVideoPage, setMockVideoTime } from './support/bilibiliPage';
import { writeSyncStorage } from './support/extensionStorage';
import { routeMockSponsorSegments } from './support/sponsorBlockApi';
import { waitForBilibiliContentScript } from './support/submissionNotice';

for (const mode of [0, 1, 2, 3, 4]) {
    for (const trigger of ['automatic', 'keyboard', 'hover-keyboard', 'quick-hover-keyboard', 'click']) {
        test(`notice presentation mode=${mode} trigger=${trigger}`, async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
            await writeSyncStorage(extensionServiceWorker, { skipOnSeekToSegment: true, noticeVisibilityMode: mode,
                skipNoticeDuration: 60, advanceSkipNotice: false, skipKeybind: { key: 'Enter' },
                categorySelections: [{ name: 'sponsor', option: trigger === 'automatic' ? 2 : 1 }] });
            await routeMockSponsorSegments(extensionContext, defaultMockBvid, [{ segment: [5, 20], UUID: 'presentation', category: 'sponsor', actionType: 'skip', cid: defaultMockCid, videoDuration: 120 }]);
            await routeMockBilibiliVideoPage(page, { currentTime: 0, paused: false });
            await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
            await waitForBilibiliContentScript(page, sendContentMessage);
            await expect.poll(async () => (await sendContentMessage<{ sponsorTimes?: unknown[] }>({ message: 'isInfoFound', updating: false })).sponsorTimes?.length).toBe(1);
            await page.mouse.move(1200, 700);
            await setMockVideoTime(page, 6, true);
            const card = page.locator('.sponsorSkipStackCard');
            await expect(card).toHaveCount(1);
            await pauseMockVideo(page);
            await page.waitForTimeout(400);
            await card.evaluate(el => {
                (window as Window & { repeatedEntrances?: number }).repeatedEntrances = 0;
                el.addEventListener('animationstart', event => {
                    if ((event as AnimationEvent).animationName === 'sb-stack-arrive') {
                        (window as Window & { repeatedEntrances: number }).repeatedEntrances++;
                    }
                });
            });
            const id = await card.getAttribute('id');
            const action = card.locator('[id^="sponsorSkipUnskipButton"]').first();
            const hovered = trigger === 'hover-keyboard' || trigger === 'quick-hover-keyboard' || trigger === 'click';
            if (hovered) {
                await action.hover();
                if (trigger !== 'quick-hover-keyboard') await page.waitForTimeout(400);
                await card.evaluate(el => {
                    const frames: { opacity: number; height: number; y: number }[] = [];
                    (window as Window & { presentationFrames?: typeof frames }).presentationFrames = frames;
                    const until = performance.now() + 700;
                    const sample = () => {
                        frames.push({ opacity: Number(getComputedStyle(el.firstElementChild).opacity),
                            height: el.querySelector('.sponsorSkipStackDetail').getBoundingClientRect().height,
                            y: el.querySelector('[id^="sponsorSkipUnskipButton"]').getBoundingClientRect().y });
                        if (performance.now() < until) requestAnimationFrame(sample);
                    };
                    sample();
                });
            }
            if (trigger === 'keyboard' || trigger === 'hover-keyboard' || trigger === 'quick-hover-keyboard') await page.keyboard.press('Enter');
            if (trigger === 'click') await action.click();
            await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(20);
            await expect(card).toHaveAttribute('id', id);
            if (hovered) {
                await page.waitForTimeout(750);
                const frames = await page.evaluate(() => (window as Window & { presentationFrames: { opacity: number; height: number; y: number }[] }).presentationFrames);
                expect(frames.length).toBeGreaterThan(5);
                expect(Math.min(...frames.map(f => f.opacity))).toBe(1);
                if (trigger === 'quick-hover-keyboard') {
                    for (let i = 1; i < frames.length; i++) expect(frames[i].height).toBeGreaterThanOrEqual(frames[i - 1].height - 0.5);
                } else {
                    expect(Math.max(...frames.map(f => f.height)) - Math.min(...frames.map(f => f.height))).toBeLessThan(1);
                }
                expect(Math.max(...frames.map(f => f.y)) - Math.min(...frames.map(f => f.y))).toBeLessThan(1);
                await page.mouse.move(1200, 700);
            }
            const panel = card.locator('.sponsorSkipNoticeTableContainer');
            await expect(card).toHaveAttribute('aria-expanded', String(mode === 0));
            await expect(panel).toHaveCSS('opacity', mode >= 3 ? '0.5' : '1');
            // Undo/redo through the global shortcut, with no lingering pointer focus.
            await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
            await page.keyboard.press('Enter');
            await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(5.001, 3);
            await expect(card).toHaveAttribute('aria-expanded', String(mode < 2));
            await expect(panel).toHaveCSS('opacity', mode === 4 ? '0.5' : '1');
            await page.keyboard.press('Enter');
            await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(20);
            await expect(card).toHaveAttribute('aria-expanded', String(mode === 0));
            await expect(panel).toHaveCSS('opacity', mode >= 3 ? '0.5' : '1');
            expect(await page.evaluate(() => (window as Window & { repeatedEntrances: number }).repeatedEntrances)).toBe(0);
        });
    }
}
