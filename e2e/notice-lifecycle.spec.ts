import { expect, test } from "./fixtures/extension";
import { defaultMockBvid, defaultMockCid, pauseMockVideo, routeMockBilibiliVideoPage, setMockVideoTime } from "./support/bilibiliPage";
import { writeSyncStorage } from "./support/extensionStorage";
import { routeMockSponsorSegments } from "./support/sponsorBlockApi";
import { waitForBilibiliContentScript } from "./support/submissionNotice";

const cards = '.sponsorSkipStackCard';

test.beforeEach(async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await writeSyncStorage(extensionServiceWorker, {
        skipOnSeekToSegment: true, noticeVisibilityMode: 2, skipNoticeDuration: 5, advanceSkipNotice: false,
    });
    await routeMockSponsorSegments(extensionContext, defaultMockBvid, [
        { segment: [5, 20], UUID: 'lifecycle-first' },
        { segment: [90, 100], UUID: 'lifecycle-second' },
    ].map(segment => ({ ...segment, category: 'sponsor', actionType: 'skip', cid: defaultMockCid, videoDuration: 120 })));
    await routeMockBilibiliVideoPage(page, { currentTime: 0, paused: false });
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);
    await expect.poll(async () => (await sendContentMessage<{ sponsorTimes?: unknown[] }>({
        message: 'isInfoFound', updating: false,
    })).sponsorTimes?.length).toBe(2);
    await setMockVideoTime(page, 6, true);
    await expect(page.locator(cards)).toHaveCount(1);
    await pauseMockVideo(page);
    await page.mouse.move(1200, 700);
});

test('stays visible for all five seconds and hover resumes the remaining countdown', async ({ extensionPage: page }) => {
    const card = page.locator(cards);
    const timer = card.locator('[id^="skipNoticeTimerText"]');
    await expect(timer).toHaveText(/^3/);
    await page.waitForTimeout(250);
    expect(await card.evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.99);
    const target = await card.locator('.sponsorSkipNoticeCloseButton').boundingBox();
    await card.locator('.sponsorSkipStackHeader').hover();
    await page.waitForTimeout(1500);
    await expect(card).toHaveCount(1);
    await page.mouse.move(1200, 700);
    await expect(timer).toHaveText(/^[23]/);
    await expect(card).toHaveCount(0, { timeout: 4500 });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    await page.waitForTimeout(350);
    await expect(page.locator(cards)).toHaveCount(0);
});

test('seeking to another segment clears even a manually stopped old notice', async ({ extensionPage: page }) => {
    await page.locator(cards).locator('.sponsorSkipNoticeTimeLeft').click();
    await page.mouse.move(1200, 700);
    await page.locator('video').evaluate((v: HTMLVideoElement) => v.play());
    await setMockVideoTime(page, 91, true);
    await expect(page.locator(`${cards}[id*="lifecycle-second"]`)).toHaveCount(1);
    await pauseMockVideo(page);
    await expect(page.locator(cards)).toHaveCount(1);
    await expect(page.locator(`${cards}[id*="lifecycle-first"]`)).toHaveCount(0);
});

test('keeps same-segment seeks and notice undo/redo, but clears distant seeks in either direction', async ({ extensionPage: page }) => {
    const card = page.locator(cards);
    const id = await card.getAttribute('id');
    await setMockVideoTime(page, 10, true);
    await expect(card).toHaveAttribute('id', id);
    const action = card.locator('[id^="sponsorSkipUnskipButton"]').first();
    await action.click();
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(5.001, 3);
    await action.click();
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(20);
    await expect(card).toHaveAttribute('id', id);
    await setMockVideoTime(page, 60, true);
    await expect(card).toHaveCount(0);
    await page.locator('video').evaluate((v: HTMLVideoElement) => v.play());
    await setMockVideoTime(page, 91, true);
    await expect(card).toHaveCount(1);
    await pauseMockVideo(page);
    await setMockVideoTime(page, 40, true);
    await expect(card).toHaveCount(0);
});

test('interpolates opacity before removing a closed card', async ({ extensionPage: page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const card = page.locator(cards);
    await card.locator('.sponsorSkipNoticeCloseButton').hover();
    await expect(card).not.toHaveClass(/sponsorSkipStackArriving/);
    const frames = await card.evaluate(el => {
        (el.querySelector('.sponsorSkipNoticeCloseButton') as HTMLButtonElement).click();
        const animation = el.getAnimations().find(animation =>
            animation instanceof CSSTransition && animation.transitionProperty === 'opacity');
        if (!animation) throw new Error('Closing a card must start an opacity transition');
        const duration = Number(animation.effect.getTiming().duration);
        const exitDuration = parseFloat(getComputedStyle(el).getPropertyValue('--sb-exit-duration'));
        if (duration <= 0 || duration !== exitDuration) throw new Error('The close transition must match the disposal delay');
        // Sample the real CSS interpolation in one task, before the disposal timer
        // can run. CI frame rate must not decide how many samples we observe.
        animation.pause();
        const samples = [0, 0.25, 0.5, 0.75, 1].map(progress => {
            animation.currentTime = duration * progress;
            const style = getComputedStyle(el);
            return { opacity: Number(style.opacity), visibility: style.visibility, clip: style.clipPath };
        });
        animation.currentTime = 0;
        animation.play();
        return samples;
    });
    expect(frames[0].opacity).toBeCloseTo(1, 3);
    expect(frames[4].opacity).toBeCloseTo(0, 3);
    for (let i = 1; i < frames.length; i++) expect(frames[i].opacity).toBeLessThan(frames[i - 1].opacity);
    expect(frames.every(frame => frame.visibility === 'visible' && frame.clip === 'none')).toBe(true);
    await expect(card).toHaveCount(0);
});

test('frequent short hover interruptions consume accumulated display time', async ({ extensionPage: page }) => {
    const card = page.locator(cards);
    // Use actual pointer movement: the notice may expire between two passes,
    // and locator.hover() would wait for that already removed card to return.
    const header = await card.locator('.sponsorSkipStackHeader').boundingBox();
    // The old integer interval lost every subsecond active period and stayed at 5 forever.
    for (let i = 0; i < 16 && await card.count(); i++) {
        await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
        await page.waitForTimeout(70);
        await page.mouse.move(1200, 700);
        await page.waitForTimeout(550);
    }
    await expect(card).toHaveCount(0, { timeout: 1000 });
});

for (const obstruction of ['scrolled away', 'covered by a page overlay']) {
    test(`creates the next notice when the player is ${obstruction}`, async ({ extensionPage: page }) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.locator(cards).locator('.sponsorSkipNoticeCloseButton').click();
        await expect(page.locator(cards)).toHaveCount(0);
        if (obstruction === 'scrolled away') {
            await page.evaluate(() => {
                document.body.style.height = '2400px';
                window.scrollTo(0, 1200);
            });
        } else {
            await page.evaluate(() => {
                const overlay = document.createElement('div');
                overlay.id = 'player-cover';
                overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:black';
                document.body.append(overlay);
            });
        }
        await page.locator('video').evaluate((video: HTMLVideoElement) => video.play());
        await setMockVideoTime(page, 91, true);
        await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(100);
        await expect(page.locator(`${cards}[id*="lifecycle-second"]`)).toHaveCount(1);
        await pauseMockVideo(page);
        await page.evaluate(() => {
            document.getElementById('player-cover')?.remove();
            window.scrollTo(0, 0);
        });
        await expect(page.locator(cards)).toBeVisible();
        expect(errors).toEqual([]);
        await page.locator(cards).locator('.sponsorSkipNoticeCloseButton').click();
        await expect(page.locator(cards)).toHaveCount(0);
    });
}
