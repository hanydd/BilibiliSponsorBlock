import { expect, test } from './fixtures/extension';
import { defaultMockBvid, defaultMockCid, getMockVideoTime, pauseMockVideo, routeMockBilibiliVideoPage, setMockVideoTime } from './support/bilibiliPage';
import { writeSyncStorage } from './support/extensionStorage';
import { routeMockSponsorSegments } from './support/sponsorBlockApi';
import { waitForBilibiliContentScript } from './support/submissionNotice';

test.beforeEach(async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await writeSyncStorage(extensionServiceWorker, { skipOnSeekToSegment: true, noticeVisibilityMode: 2, skipNoticeDuration: 60, advanceSkipNotice: false, skipKeybind: { key: 'Enter' } });
    await routeMockSponsorSegments(extensionContext, defaultMockBvid, [{ segment: [5, 20], UUID: 'shortcut-notice', category: 'selfpromo', actionType: 'skip', cid: defaultMockCid, videoDuration: 120 }]);
    await routeMockBilibiliVideoPage(page, { currentTime: 0, paused: false });
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);
    await expect.poll(async () => (await sendContentMessage<{ sponsorTimes?: unknown[] }>({ message: 'isInfoFound', updating: false })).sponsorTimes?.length).toBe(1);
    await setMockVideoTime(page, 6, true);
    await expect(page.locator('.sponsorSkipStackCard')).toHaveCount(1);
    await pauseMockVideo(page);
    await page.mouse.move(1200, 700);
});

test('mouse skip leaves player shortcuts available and does not keep button focus', async ({ extensionPage: page }) => {
    await page.evaluate(() => {
        // Represent the player's existing handler without adding any extension key forwarding.
        document.addEventListener('keydown', event => {
            if (event.defaultPrevented || (event.target as HTMLElement).closest('button,input,textarea,select')) return;
            const video = document.querySelector('video');
            if (event.key === 'ArrowLeft') video.currentTime -= 5;
            if (event.key === 'ArrowRight') video.currentTime += 5;
        });
    });
    await page.locator('[id^="sponsorSkipUnskipButton"]').first().click();
    await expect.poll(() => getMockVideoTime(page)).toBe(20);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => getMockVideoTime(page)).toBe(15);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => getMockVideoTime(page)).toBe(20);
    expect(await page.evaluate(() => !!document.activeElement?.closest('.sponsorSkipStackCard button'))).toBe(false);
    await page.keyboard.press('Enter');
    await expect.poll(() => getMockVideoTime(page)).toBeCloseTo(5.001, 3);
});

test('card does not swallow or cancel unrelated keydown and keyup events', async ({ extensionPage: page }) => {
    await page.locator('.sponsorSkipNoticeCloseButton').focus();
    const result = await page.evaluate(() => {
        const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'f', 'm', 'Escape', 'F6', 'z'];
        const received: string[] = [];
        for (const type of ['keydown', 'keyup']) {
            const listener = (event: KeyboardEvent) => received.push(`${event.type}:${event.key}:${event.defaultPrevented}`);
            window.addEventListener(type, listener);
            for (const key of keys) document.activeElement.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
            window.removeEventListener(type, listener);
        }
        return { received, expected: ['keydown', 'keyup'].flatMap(type => keys.map(key => `${type}:${key}:false`)) };
    });
    expect(result.received).toEqual(result.expected);
});

test('keyboard feedback activation does not also trigger the extension skip binding', async ({ extensionPage: page }) => {
    const card = page.locator('.sponsorSkipStackCard');
    await card.locator('.sponsorSkipNoticeCloseButton').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    await expect(card.locator('button.voteButton').nth(2)).toBeFocused();
    const before = await getMockVideoTime(page);
    await page.keyboard.press('Enter');
    await expect(card.locator('[id^="sponsorSkipNoticeEditSegmentsRow"]')).toBeVisible();
    expect(await getMockVideoTime(page)).toBe(before);
});

test('only the configured extension binding is handled after a mouse action', async ({ extensionPage: page, extensionServiceWorker }) => {
    await writeSyncStorage(extensionServiceWorker, { skipKeybind: { key: 'k' } });
    await page.locator('[id^="sponsorSkipUnskipButton"]').first().click();
    await expect.poll(() => getMockVideoTime(page)).toBe(20);
    await page.keyboard.press('k');
    await expect.poll(() => getMockVideoTime(page)).toBeCloseTo(5.001, 3);
    await page.locator('.sponsorSkipNoticeTimeLeft').focus();
    const result = await page.evaluate(() => {
        let received = false;
        let prevented = true;
        const listener = (event: KeyboardEvent) => { received = true; prevented = event.defaultPrevented; };
        window.addEventListener('keydown', listener, { once: true });
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        window.removeEventListener('keydown', listener);
        return { received, prevented };
    });
    expect(result).toEqual({ received: true, prevented: false });
    expect(await getMockVideoTime(page)).toBeCloseTo(5.001, 3);
    await page.keyboard.press('k');
    await expect.poll(() => getMockVideoTime(page)).toBe(20);
});

test('empty space in the card column remains clickable with a fractional player height', async ({ extensionPage: page }) => {
    await page.locator('#bilibili-player').evaluate(player => { player.style.height = '540.5px'; });
    await page.evaluate(() => {
        const video = document.querySelector('video');
        video.addEventListener('click', () => {
            if (video.paused) void video.play();
            else video.pause();
        });
    });
    const stack = page.locator('.sponsorSkipStack');
    await expect(page.locator('.sponsorSkipNoticeRoot')).toHaveCount(0);
    const header = await page.locator('.sponsorSkipStackHeader').boundingBox();
    await expect.poll(async () => (await stack.boundingBox()).height).toBeCloseTo(header.height, 1);
    const rect = await stack.boundingBox();
    const player = await page.locator('.bpx-player-video-area').boundingBox();
    const point = { x: rect.x + rect.width / 2, y: player.y + 50 };
    expect(await page.evaluate(({ x, y }) => document.elementsFromPoint(x, y)
        .some(element => element.matches('.sponsorSkipStack, .sponsorSkipStackBody, .sponsorSkipNoticeContainer')), point)).toBe(false);
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point)).toBe('VIDEO');
    const below = { x: point.x, y: rect.y + rect.height + 20 };
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, below)).toBe('VIDEO');
    await page.locator('.sponsorSkipStackHeader').hover();
    const detailHeight = await page.locator('.sponsorSkipStackDetailInner').evaluate(el => el.getBoundingClientRect().height);
    await expect.poll(async () => (await stack.boundingBox()).height).toBeCloseTo(header.height + detailHeight, 1);
    await page.mouse.move(point.x, point.y);
    await expect.poll(async () => (await stack.boundingBox()).height).toBeCloseTo(header.height, 1);
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(false);
    await page.waitForTimeout(400);
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
    await page.locator('[id^="sponsorSkipUnskipButton"]').first().click();
    await expect.poll(() => getMockVideoTime(page)).toBe(20);
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
});
