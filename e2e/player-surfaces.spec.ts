import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/extension';
import { defaultMockBvid, defaultMockCid, routeMockBilibiliVideoPage } from './support/bilibiliPage';
import { routeMockSponsorSegments } from './support/sponsorBlockApi';
import { writeSyncStorage } from './support/extensionStorage';
import { waitForBilibiliContentScript } from './support/submissionNotice';

for (const engine of ['legacy', 'rules']) {
    for (const surface of ['inline-mini', 'document-pip']) {
        test(`${engine}: shared notice interactions in ${surface}`, async ({
            extensionContext: context, extensionPage: page, extensionServiceWorker: worker, sendContentMessage,
        }, info) => {
            const errors: string[] = [];
            page.on('pageerror', e => errors.push(e.message));
            await writeSyncStorage(worker, {
                skipEngineMode: engine, skipOnSeekToSegment: true, skipNoticeDuration: 60,
                noticeVisibilityMode: 3, advanceSkipNotice: false, skipKeybind: { key: 'Enter' },
                categorySelections: [{ name: 'sponsor', option: 2 }],
            });
            await routeMockSponsorSegments(context, defaultMockBvid, [5, 20].map((start, index) => ({
                segment: [start, start + 5], UUID: `surface-${index}`, category: 'sponsor', actionType: 'skip',
                cid: defaultMockCid, videoDuration: 120,
            })));
            await routeMockBilibiliVideoPage(page, { currentTime: 0, paused: false });
            await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
            await waitForBilibiliContentScript(page, sendContentMessage);
            await expect.poll(async () => (await sendContentMessage<{ sponsorTimes?: unknown[] }>({ message: 'isInfoFound', updating: false })).sponsorTimes?.length).toBe(2);
            await page.addStyleTag({ content: 'video { width: 100%; height: 100%; }' });
            const time = (target: Page) => target.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime);
            const seek = async (target: Page, value: number) => target.locator('video').evaluate(async (v: HTMLVideoElement, time) => {
                v.currentTime = time;
                await v.play();
            }, value);
            await seek(page, 6);
            await expect.poll(() => time(page)).toBeGreaterThanOrEqual(10);
            await page.locator('video').evaluate((v: HTMLVideoElement) => v.pause());
            const originalId = await page.locator('.sponsorSkipStackCard').getAttribute('id');
            let target = page;
            if (surface === 'document-pip') {
                const popup = context.waitForEvent('page');
                await page.evaluate(async () => {
                    const pip = await (window as Window & {
                        documentPictureInPicture: { requestWindow(options: { width: number; height: number }): Promise<Window> };
                    }).documentPictureInPicture.requestWindow({ width: 320, height: 180 });
                    // Like the real site, copy only CSS visible to page JavaScript.
                    for (const sheet of document.styleSheets) {
                        const style = pip.document.createElement('style');
                        style.textContent = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
                        pip.document.head.append(style);
                    }
                    const area = document.querySelector('.bpx-player-video-area');
                    const parent = area.parentElement;
                    pip.document.body.append(area);
                    pip.addEventListener('pagehide', () => parent.prepend(area), { once: true });
                });
                target = await popup;
                target.on('pageerror', e => errors.push(e.message));
                await target.setViewportSize({ width: 320, height: 180 });
                await target.bringToFront();
                await expect(target.locator('[data-sb-player-surface]')).toHaveCount(1);
            } else {
                await page.locator('#bilibili-player').evaluate(el => {
                    el.style.width = '320px'; el.style.height = '180px';
                    el.querySelector('.bpx-player-container').setAttribute('data-screen', 'mini');
                });
            }
            const card = target.locator(`[id="${originalId}"]`);
            await expect(card).toHaveCSS('height', '34px');
            await expect(target.locator('.sponsorSkipStack')).toHaveCSS('position', 'absolute');
            await expect.poll(() => target.locator('video').evaluate(v => v.getBoundingClientRect().y)).toBe(0);
            await card.locator('[id^="sponsorSkipUnskipButton"]').click();
            await expect.poll(() => time(target)).toBeCloseTo(engine === 'rules' ? 5 : 5.001, 3);
            await target.mouse.move(0, 0);
            await target.keyboard.press('Enter');
            await expect.poll(() => time(target)).toBe(10);

            // Inputs created by the destination document use a different JS realm.
            await target.evaluate(() => {
                const input = document.createElement('input');
                input.id = 'pip-comment'; document.body.append(input); input.focus();
            });
            await target.keyboard.press('Enter');
            expect(await time(target)).toBe(10);
            await target.locator('#pip-comment').evaluate(el => el.remove());

            await writeSyncStorage(worker, { skipNoticeDuration: 1 });
            await target.evaluate(() => window.dispatchEvent(new Event('blur')));
            // The opener's focus must not resume a notice in a different window.
            if (target !== page) await page.evaluate(() => window.dispatchEvent(new Event('focus')));
            await target.waitForTimeout(1300);
            await expect(card).toHaveCount(1);
            await target.evaluate(() => window.dispatchEvent(new Event('focus')));
            await expect(card).toHaveCount(0);
            await writeSyncStorage(worker, { skipNoticeDuration: 60 });

            await seek(target, 21);
            await expect.poll(() => time(target)).toBeGreaterThanOrEqual(25);
            await target.locator('video').evaluate((v: HTMLVideoElement) => v.pause());
            const next = target.locator('.sponsorSkipStackCard[id*="surface-1"]');
            await expect(next).toBeVisible();
            await next.locator('.sponsorSkipStackHeader').hover();
            await next.locator('.voteButton').nth(2).click();
            const edit = next.locator('[id^="sponsorSkipNoticeEditSegmentsRow"] button');
            await expect(edit).toHaveCount(2);
            for (const button of await edit.all()) {
                await expect.poll(() => button.evaluate(el => {
                    const r = el.getBoundingClientRect();
                    return el.contains(el.ownerDocument.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
                })).toBe(true);
            }
            await target.screenshot({ path: info.outputPath('small-window-editor.png') });
            if (target !== page) {
                const id = await next.getAttribute('id');
                await page.evaluate(() => window['documentPictureInPicture'].window.close());
                await page.bringToFront();
                await expect(page.locator(`[id="${id}"]`)).toBeVisible();
                await expect(page.locator('[data-sb-player-surface]')).toHaveCount(0);
            }
            await page.locator('.sponsorSkipStackCard[id*="surface-1"] .sponsorSkipNoticeCloseButton').click();
            await expect(page.locator('.sponsorSkipStackCard[id*="surface-1"]')).toHaveCount(0);
            expect(errors).toEqual([]);
        });
    }
}
