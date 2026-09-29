import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/extension";
import { defaultMockBvid, defaultMockCid, pauseMockVideo, routeMockBilibiliVideoPage, setMockVideoTime } from "./support/bilibiliPage";
import { writeSyncStorage } from "./support/extensionStorage";
import { routeMockSponsorSegments } from "./support/sponsorBlockApi";
import { waitForBilibiliContentScript } from "./support/submissionNotice";

const cardSelector = ".sponsorSkipStackCard";

// Skip idle playback between test segments without simulating a user seek.
// Resume just before the next segment so the real scheduler performs the skip.
async function advancePlayback(page: Page, time: number): Promise<void> {
    await page.locator('video').evaluate(async (video: HTMLVideoElement, time) => {
        await new Promise<void>(resolve => {
            const suppress = (event: Event) => event.stopImmediatePropagation();
            video.addEventListener('seeking', suppress, true);
            video.addEventListener('seeked', () => {
                video.removeEventListener('seeking', suppress, true);
                resolve();
            }, { once: true });
            video.currentTime = time - 1.2;
        });
        await video.play();
        video.dispatchEvent(new Event('playing'));
    }, time);
}


test.beforeEach(async ({ extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await writeSyncStorage(extensionServiceWorker, {
        skipOnSeekToSegment: true, noticeVisibilityMode: 2, skipNoticeDuration: 60,
    });
    await routeMockSponsorSegments(extensionContext, defaultMockBvid, Array.from({ length: 9 }, (_, i) => ({
        segment: [5 + i * 10, 8 + i * 10], UUID: `stack-${i}`, category: "sponsor", actionType: "skip",
        cid: defaultMockCid, videoDuration: 120,
    })));
    await routeMockBilibiliVideoPage(page, { currentTime: 0, paused: false });
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);
    await expect.poll(async () => (await sendContentMessage<{ sponsorTimes?: unknown[] }>({
        message: "isInfoFound", updating: false,
    })).sponsorTimes?.length).toBe(9);
    // Bilibili's reset caused the original #205 spacer/real-table height mismatch.
    await page.addStyleTag({ content: "table { border-collapse: collapse; border-spacing: 0; }" });
    for (let i = 0; i < 5; i++) {
        await advancePlayback(page, 6 + i * 10);
        await expect(page.locator(cardSelector)).toHaveCount(i + 1);
    }
    await pauseMockVideo(page);
    await page.mouse.move(1200, 700);
    await page.waitForTimeout(650);
});

test("keeps primary targets fixed during interrupted expansion and upper-card auto-collapse", async ({ extensionPage: page }) => {
    const cards = page.locator(cardSelector);
    await page.evaluate(() => {
        document.addEventListener("pointermove", (event) => {
            const card = (event.target as Element).closest(".sponsorSkipStackCard");
            const button = card?.querySelector(".sponsorSkipNoticeCloseButton");
            if (button) (window as Window & { entryY?: number }).entryY = button.getBoundingClientRect().y;
        }, true);
    });
    for (const index of [3, 2, 1, 2, 0, 1, 0, 2]) {
        const button = cards.nth(index).locator(".sponsorSkipNoticeCloseButton");
        let before = await button.boundingBox();
        const viewport = await page.locator(".sponsorSkipStack").boundingBox();
        // Downward expansion can move lower cards into the scrollable overflow.
        // Bring an offscreen target back before testing entry into its real hit area.
        if (before.y < viewport.y || before.y + before.height > viewport.y + viewport.height) {
            await button.scrollIntoViewIfNeeded();
            before = await button.boundingBox();
        }
        await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
        await page.waitForTimeout(75);
        const after = await button.boundingBox();
        const enteredAt = await page.evaluate(() => (window as Window & { entryY: number }).entryY);
        expect(Math.abs(after.y - enteredAt), `card ${index}`).toBeLessThan(0.5);
    }
    const bottom = cards.first();
    const header = bottom.locator(".sponsorSkipStackHeader");
    await header.hover();
    const before = await header.boundingBox();
    await page.waitForTimeout(1350);
    expect(Math.abs((await header.boundingBox()).y - before.y)).toBeLessThan(1);
    for (let i = 1; i < 5; i++) await expect(cards.nth(i)).toHaveAttribute("aria-expanded", "false");
    const upper = cards.nth(1).locator(".sponsorSkipNoticeCloseButton");
    const position = await upper.boundingBox();
    await upper.hover();
    await page.waitForTimeout(550);
    expect(Math.abs((await upper.boundingBox()).y - position.y)).toBeLessThan(1);
});

test("slides survivors down after close, then admits overflow using the same cards", async ({ extensionPage: page }, testInfo) => {
    await page.locator("#bilibili-player").evaluate((e) => { e.style.width = "480px"; e.style.height = "270px"; });
    await page.waitForTimeout(650);
    const visible = page.locator(`${cardSelector}:not(.sponsorSkipStackFolded)`);
    const first = visible.first();
    const second = visible.nth(1);
    const secondId = await second.getAttribute("id");
    const secondHeader = page.locator(`[id="${secondId}"] .sponsorSkipStackHeader`);
    const before = await secondHeader.boundingBox();
    // Capture every frame to distinguish a real downward transition from a final-position jump.
    await page.evaluate((id) => {
        const samples: number[] = [];
        (window as Window & { stackMotion?: number[] }).stackMotion = samples;
        const start = performance.now();
        function frame() {
            const el = document.getElementById(id)?.querySelector(".sponsorSkipStackHeader");
            if (el) samples.push(el.getBoundingClientRect().y);
            if (performance.now() - start < 1200) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }, secondId);
    await first.locator(".sponsorSkipNoticeCloseButton").click();
    await expect(page.locator(cardSelector)).toHaveCount(4);
    await page.waitForTimeout(1100);
    const after = await secondHeader.boundingBox();
    expect(after.y - before.y).toBeCloseTo(40, 0);
    const samples = await page.evaluate(() => (window as Window & { stackMotion: number[] }).stackMotion);
    expect(samples.filter((y) => y > before.y + 1 && y < after.y - 1).length).toBeGreaterThan(5);
    await page.mouse.move(1200, 700);
    await page.waitForTimeout(650);
    // Further shrink until overflow is guaranteed.
    await page.locator("#bilibili-player").evaluate((e) => { e.style.width = "320px"; e.style.height = "180px"; });
    await page.waitForTimeout(650);
    const folded = page.locator(".sponsorSkipStackFolded").first();
    await expect(folded).toHaveCount(1);
    const id = await folded.getAttribute("id");
    await folded.evaluate((e) => e.setAttribute("data-same-card", "true"));
    const edge = await folded.boundingBox();
    await page.mouse.move(edge.x + 20, edge.y + 3);
    await expect(page.locator(".sponsorSkipStack")).toHaveClass(/sponsorSkipStackReviewing/);
    await expect(page.locator(`[id="${id}"]`)).not.toHaveClass(/sponsorSkipStackFolded/);
    await expect(page.locator(`[id="${id}"]`)).toHaveAttribute("data-same-card", "true");
    await expect(page.locator(`[id="${id}"] .sponsorSkipNoticeCloseButton`)).toBeVisible();
    await page.locator("#bilibili-player").screenshot({ path: testInfo.outputPath("B1-inline-overflow.png") });
});

test("pauses queued notices and clears the entire stack when notices are disabled", async ({ extensionPage: page, extensionServiceWorker }) => {
    await page.locator("#bilibili-player").evaluate((e) => { e.style.width = "320px"; e.style.height = "180px"; });
    await page.waitForTimeout(650);
    const folded = page.locator(".sponsorSkipStackFolded").first();
    const id = await folded.getAttribute("id");
    await writeSyncStorage(extensionServiceWorker, { skipNoticeDuration: 1 });
    await page.waitForTimeout(1100);
    await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
    await writeSyncStorage(extensionServiceWorker, { dontShowNotice: true });
    await expect(page.locator(cardSelector)).toHaveCount(0);
    await expect(page.locator(".sponsorSkipStack")).toHaveCount(0);
});

test("keeps keyboard targets fixed and opens the existing category editor", async ({ extensionPage: page }) => {
    const cards = page.locator(cardSelector);
    const target = cards.nth(2).locator(".sponsorSkipNoticeCloseButton");
    const before = await target.boundingBox();
    await target.focus();
    await page.waitForTimeout(1100);
    expect(Math.abs((await target.boundingBox()).y - before.y)).toBeLessThan(0.5);
    await cards.first().locator(".sponsorSkipStackHeader").hover();
    await page.waitForTimeout(1100);
    // Pointer below keyboard focus must not collapse gaps supporting the focused button.
    expect(Math.abs((await target.boundingBox()).y - before.y)).toBeLessThan(0.5);
    const editor = cards.first();
    await editor.locator(".sponsorSkipNoticeCloseButton").focus();
    await editor.locator(".voteButton").nth(2).click();
    await editor.locator("[id^='sponsorSkipNoticeEditSegmentsRow'] button").nth(1).click();
    await expect(editor.locator("select.sponsorTimeCategories")).toBeVisible();
    const primaryBefore = await editor.locator(".sponsorSkipNoticeCloseButton").boundingBox();
    await editor.locator("select.sponsorTimeCategories").selectOption("selfpromo");
    await page.waitForTimeout(550);
    expect(Math.abs((await editor.locator(".sponsorSkipNoticeCloseButton").boundingBox()).y - primaryBefore.y)).toBeLessThan(0.5);
});

test("supports reduced motion and holds new arrivals above the hovered card", async ({ extensionPage: page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const cards = page.locator(cardSelector);
    const primary = cards.first().locator(".sponsorSkipNoticeCloseButton");
    await primary.hover();
    const before = await primary.boundingBox();
    await advancePlayback(page, 56);
    await expect(cards).toHaveCount(6);
    await pauseMockVideo(page);
    await expect(cards.last()).toHaveClass(/sponsorSkipStackFolded/);
    expect(Math.abs((await primary.boundingBox()).y - before.y)).toBeLessThan(0.5);
    await expect(cards.first()).toHaveCSS("transition-duration", "0s");
    await primary.click();
    await expect(cards).toHaveCount(5);
    await expect(cards.last()).not.toHaveClass(/sponsorSkipStackFolded/);
});

test("opens overflow from the keyboard and keeps long editors inside the player", async ({ extensionPage: page }) => {
    await page.locator("#bilibili-player").evaluate((e) => { e.style.width = "320px"; e.style.height = "180px"; });
    await page.waitForTimeout(600);
    const count = page.locator(".sponsorSkipStackCount:not([hidden])");
    const hiddenId = await page.locator(".sponsorSkipStackFolded").first().getAttribute("id");
    await count.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".sponsorSkipStack")).toHaveClass(/sponsorSkipStackReviewing/);
    const target = page.locator(`[id="${hiddenId}"]`);
    await expect(target.locator(".sponsorSkipStackHeader button").first()).toBeFocused();
    await page.waitForTimeout(550);
    const bounds = await page.locator(".bpx-player-video-area").boundingBox();
    await target.locator(".voteButton").nth(2).click();
    await target.locator("[id^='sponsorSkipNoticeEditSegmentsRow'] button").nth(1).click();
    const select = target.locator("select.sponsorTimeCategories");
    await expect(select).toBeVisible();
    await select.focus();
    const selectBounds = await select.boundingBox();
    expect(selectBounds.y).toBeGreaterThanOrEqual(bounds.y);
    expect(selectBounds.y + selectBounds.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    // A close in the scroll viewport should also move its upper survivor downward.
    const upper = page.locator(cardSelector).nth(2);
    const header = upper.locator(".sponsorSkipStackHeader");
    const before = await header.boundingBox();
    await target.locator(".sponsorSkipNoticeCloseButton").click();
    await page.waitForTimeout(750);
    const after = await header.boundingBox();
    expect(after.y).toBeGreaterThan(before.y + 30);
});

test("expands downward with one bottom reserve and moves only the lower cards", async ({ extensionPage: page }, testInfo) => {
    const cards = page.locator(cardSelector);
    const header = (index: number) => cards.nth(index).locator(".sponsorSkipStackHeader");
    const bottomHeader = await header(0).boundingBox();
    const upperHeader = await header(1).boundingBox();
    expect(bottomHeader.y - upperHeader.y - upperHeader.height).toBeCloseTo(6, 1);
    const host = await page.locator(".sponsorSkipStack").boundingBox();
    // The expansion reserve is a coordinate, not an invisible box below the cards.
    expect(host.y + host.height).toBeCloseTo(bottomHeader.y + bottomHeader.height, 1);
    await header(0).hover();
    await page.waitForTimeout(550);
    const detail = await cards.first().locator(".sponsorSkipStackDetail").boundingBox();
    expect(detail.y).toBeCloseTo(bottomHeader.y + bottomHeader.height, 1);
    const expandedHost = await page.locator(".sponsorSkipStack").boundingBox();
    expect(detail.y + detail.height).toBeLessThanOrEqual(expandedHost.y + expandedHost.height + 0.5);
    expect((await header(0).boundingBox()).y).toBeCloseTo(bottomHeader.y, 1);
    expect((await header(1).boundingBox()).y).toBeCloseTo(upperHeader.y, 1);

    const active = await header(3).boundingBox();
    const lower = await header(2).boundingBox();
    const higher = await header(4).boundingBox();
    await header(3).hover();
    const minimumGap = await page.evaluate(async () => {
        const cards = document.querySelectorAll(".sponsorSkipStackCard");
        const detail = cards[3].querySelector(".sponsorSkipStackDetail");
        const lower = cards[2].querySelector(".sponsorSkipStackHeader");
        const start = performance.now();
        let minimum = Infinity;
        while (performance.now() - start < 550) {
            await new Promise(requestAnimationFrame);
            minimum = Math.min(minimum, lower.getBoundingClientRect().top - detail.getBoundingClientRect().bottom);
        }
        return minimum;
    });
    expect(minimumGap).toBeGreaterThanOrEqual(0);
    expect((await header(3).boundingBox()).y).toBeCloseTo(active.y, 1);
    expect((await header(4).boundingBox()).y).toBeCloseTo(higher.y, 1);
    const expandedDetail = await cards.nth(3).locator(".sponsorSkipStackDetail").boundingBox();
    expect(expandedDetail.y).toBeCloseTo(active.y + active.height, 1);
    const movedLower = await header(2).boundingBox();
    expect(movedLower.y - lower.y).toBeCloseTo(expandedDetail.height, 1);
    expect(movedLower.y - expandedDetail.y - expandedDetail.height).toBeCloseTo(6, 1);
    await page.locator("#bilibili-player").screenshot({ path: testInfo.outputPath("B1-downward-details.png") });
    const expandedBeforeScroll = await cards.evaluateAll((elements) => elements.map((e) => e.getAttribute("aria-expanded")));
    await page.mouse.wheel(0, 30);
    await page.waitForTimeout(1000);
    expect(await page.locator(".sponsorSkipStack").evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
    expect(await cards.evaluateAll((elements) => elements.map((e) => e.getAttribute("aria-expanded")))).toEqual(expandedBeforeScroll);
    const lowerBeforeClose = await header(2).boundingBox();
    await cards.nth(3).locator(".sponsorSkipNoticeCloseButton").click();
    await expect(cards).toHaveCount(4);
    await page.waitForTimeout(850);
    // Closing an upper card fills from above; it must not pull the lower cards up
    // when the animation finishes and the scroll surface still has extra height.
    expect((await header(2).boundingBox()).y).toBeCloseTo(lowerBeforeClose.y, 1);
});

test("new cards enter downward from above their final slots without moving existing cards", async ({ extensionPage: page }) => {
    const existing = await page.locator(`${cardSelector} .sponsorSkipStackHeader`).evaluateAll(elements =>
        elements.map(element => ({ id: element.closest('.sponsorSkipStackCard').id, y: element.getBoundingClientRect().y })));
    await page.evaluate(() => {
        const samples: Record<string, number[]> = { 'stack-5': [], 'stack-6': [] };
        (window as Window & { arrivalSamples: typeof samples }).arrivalSamples = samples;
        const start = performance.now();
        function frame() {
            for (const id of Object.keys(samples)) {
                const header = document.querySelector(`.sponsorSkipStackCard[id*="${id}"] .sponsorSkipStackHeader`);
                if (header) samples[id].push(header.getBoundingClientRect().y);
            }
            if (performance.now() - start < 1800) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    });
    await page.locator('video').evaluate((video: HTMLVideoElement) => video.play());
    for (const [time, count] of [[56, 6], [66, 7]]) {
        await advancePlayback(page, time);
        await expect(page.locator(cardSelector)).toHaveCount(count);
        // Let the native seek-to-segment-end finish before requesting another seek.
        await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(time + 2);
        await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.seeking)).toBe(false);
    }
    await pauseMockVideo(page);
    await page.waitForTimeout(700);
    const samples = await page.evaluate(() => (window as Window & { arrivalSamples: Record<string, number[]> }).arrivalSamples);
    for (const id of Object.keys(samples)) {
        const final = await page.locator(`${cardSelector}[id*="${id}"] .sponsorSkipStackHeader`).boundingBox();
        expect(samples[id].length).toBeGreaterThan(5);
        // Read the composed on-screen position, not just the child's animation keyframes.
        expect(Math.max(...samples[id]), id).toBeLessThanOrEqual(final.y + 0.5);
        expect(samples[id].filter(y => y < final.y - 1 && y > final.y - 40).length, id).toBeGreaterThan(3);
        for (let i = 1; i < samples[id].length; i++) expect(samples[id][i], id).toBeGreaterThanOrEqual(samples[id][i - 1] - 0.5);
    }
    for (const item of existing) {
        const box = await page.locator(`[id="${item.id}"] .sponsorSkipStackHeader`).boundingBox();
        expect(box.y).toBeCloseTo(item.y, 1);
    }
});

test("two and three digit countdowns fit one line and keep action positions when paused", async ({ extensionPage: page, extensionServiceWorker }) => {
    const card = page.locator(cardSelector).first();
    const timer = card.locator('.sponsorSkipNoticeTimeLeft');
    const text = card.locator('[id^="skipNoticeTimerText"]');
    for (const [width, height] of [[960, 540], [320, 180], [240, 135]]) {
        await page.locator('#bilibili-player').evaluate((el, size) => {
            el.style.width = `${size[0]}px`;
            el.style.height = `${size[1]}px`;
        }, [width, height]);
        for (const duration of [58, 300]) {
            await page.locator(cardSelector).evaluateAll(cards => cards.forEach(card =>
                (card.querySelector('.sponsorSkipNoticeCloseButton') as HTMLButtonElement).click()));
            await expect(page.locator(cardSelector)).toHaveCount(0);
            await writeSyncStorage(extensionServiceWorker, { skipNoticeDuration: duration });
            // Each iteration replays a segment. Preserve the native user-seek
            // event so the scheduler starts a new notice-suppression pass.
            await setMockVideoTime(page, 4.8, true);
            await page.locator('video').evaluate((video: HTMLVideoElement) => video.play());
            await expect(card).toHaveCount(1);
            await pauseMockVideo(page);
            await timer.hover();
            await page.mouse.move(1200, 700);
            await expect(text).toBeVisible();
            await expect(text).toHaveText(new RegExp(duration === 58 ? '^5[0-8]' : '^(300|29[0-9])'));
            const dimensions = await text.evaluate(el => {
                const range = document.createRange();
                range.selectNodeContents(el);
                const timer = el.parentElement;
                const style = getComputedStyle(timer);
                const rect = timer.getBoundingClientRect();
                return {
                    lines: range.getClientRects().length,
                    textLeft: range.getBoundingClientRect().left,
                    textRight: range.getBoundingClientRect().right,
                    contentLeft: rect.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth),
                    contentRight: rect.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth),
                };
            });
            expect(dimensions.lines).toBe(1);
            expect(dimensions.textLeft).toBeGreaterThanOrEqual(dimensions.contentLeft - 0.5);
            expect(dimensions.textRight).toBeLessThanOrEqual(dimensions.contentRight + 0.5);
            const primary = card.locator('[id^="sponsorSkipUnskipButton"]').first();
            const close = card.locator('.sponsorSkipNoticeCloseButton');
            const before = { timer: await timer.boundingBox(), primary: await primary.boundingBox(), close: await close.boundingBox() };
            await timer.hover();
            await expect(text).toBeHidden();
            expect((await timer.boundingBox()).width).toBeCloseTo(before.timer.width, 1);
            expect((await primary.boundingBox()).x).toBeCloseTo(before.primary.x, 1);
            expect((await close.boundingBox()).x).toBeCloseTo(before.close.x, 1);
        }
    }
});

test("window blur pauses expiry and returning resumes it without losing manually stopped cards", async ({ extensionPage: page, extensionServiceWorker }) => {
    const cards = page.locator(cardSelector);
    const stopped = cards.first();
    await stopped.locator('.sponsorSkipNoticeTimeLeft').click();
    await page.mouse.move(1200, 700);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await writeSyncStorage(extensionServiceWorker, { skipNoticeDuration: 1 });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(1700);
    await expect(cards).toHaveCount(5);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(cards).toHaveCount(1, { timeout: 5000 });
    await expect(stopped.locator('[id^="skipNoticeTimerStopped"]')).toBeVisible();
});

test("feedback controls can be reached and activated using the keyboard", async ({ extensionPage: page }) => {
    const card = page.locator(cardSelector).first();
    await card.locator('.sponsorSkipNoticeCloseButton').focus();
    await page.keyboard.press('Tab');
    await expect(card.locator('button.voteButton').nth(0)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(card.locator('button.voteButton').nth(1)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(card.locator('button.voteButton').nth(2)).toBeFocused();
    const playbackTime = await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime);
    await page.keyboard.press('Enter');
    await expect(card.locator('[id^="sponsorSkipNoticeEditSegmentsRow"]')).toBeVisible();
    expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBe(playbackTime);
});

test('previously displayed cards do not replay entrance when revealed from the stack', async ({ extensionPage: page }) => {
    await page.evaluate(() => {
        (window as Window & { repeatedEntrances?: number }).repeatedEntrances = 0;
        document.addEventListener('animationstart', event => {
            if ((event as AnimationEvent).animationName === 'sb-stack-arrive') {
                (window as Window & { repeatedEntrances: number }).repeatedEntrances++;
            }
        });
    });
    await page.locator('#bilibili-player').evaluate(el => { el.style.width = '320px'; el.style.height = '180px'; });
    await expect(page.locator('.sponsorSkipStackFolded').first()).toBeAttached();
    await page.locator('#bilibili-player').evaluate(el => { el.style.width = '960px'; el.style.height = '540px'; });
    await expect(page.locator('.sponsorSkipStackFolded')).toHaveCount(0);
    await page.waitForTimeout(450);
    expect(await page.evaluate(() => (window as Window & { repeatedEntrances: number }).repeatedEntrances)).toBe(0);
});

test('skip state changes keep an upper card in the same on-screen position', async ({ extensionPage: page, extensionServiceWorker }) => {
    await writeSyncStorage(extensionServiceWorker, { noticeVisibilityMode: 1 });
    await page.mouse.move(1200, 700);
    const card = page.locator(cardSelector).last();
    await page.waitForTimeout(450);
    const initial = await card.locator('.sponsorSkipStackHeader').boundingBox();
    await card.evaluate(el => {
        const frames: { y: number; animation: string }[] = [];
        (window as Window & { statePositions?: typeof frames }).statePositions = frames;
        const until = performance.now() + 2500;
        function frame() {
            frames.push({ y: el.querySelector('.sponsorSkipStackHeader').getBoundingClientRect().y,
                animation: getComputedStyle(el.firstElementChild).animationName });
            if (performance.now() < until) requestAnimationFrame(frame);
        }
        frame();
    });
    await page.keyboard.press('Enter');
    await expect(card).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(700);
    await page.keyboard.press('Enter');
    await expect(card).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(700);
    const frames = await page.evaluate(() => (window as Window & { statePositions: { y: number; animation: string }[] }).statePositions);
    for (const frame of frames) {
        expect(frame.y).toBeCloseTo(initial.y, 1);
        expect(frame.animation).toBe('none');
    }
});

test('closing the shortcut target transfers Enter to the newest remaining card', async ({ extensionPage: page }) => {
    const cards = page.locator('.sponsorSkipStackCard');
    const latest = cards.filter({ has: page.locator('[id^="sponsorSkipUnskipButton"]', { hasText: '(Enter)' }) });
    await expect(latest).toHaveCount(1);
    const count = await cards.count();
    await latest.locator('.sponsorSkipNoticeCloseButton').click();
    await expect(cards).toHaveCount(count - 1);
    await expect(latest).toHaveCount(1);
    await page.mouse.move(1200, 700);
    const action = latest.locator('[id^="sponsorSkipUnskipButton"]').first();
    const before = await action.textContent();
    await page.keyboard.press('Enter');
    await expect(action).not.toHaveText(before);
});
