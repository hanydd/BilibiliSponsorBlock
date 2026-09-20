import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures/extension";
import {
    defaultMockBvid,
    defaultMockCid,
    getMockVideoTime,
    pauseMockVideo,
    routeMockBilibiliVideoPage,
    setMockVideoTime,
} from "./support/bilibiliPage";
import { readSyncStorage, writeSyncStorage } from "./support/extensionStorage";
import { routeMockSponsorSegments } from "./support/sponsorBlockApi";
import { waitForBilibiliContentScript } from "./support/submissionNotice";

type SendContentMessage = <TResponse = unknown>(message: unknown) => Promise<TResponse>;

async function loadVideoWithSegment(
    context: BrowserContext,
    page: Page,
    sendContentMessage: SendContentMessage,
    category: "sponsor" | "selfpromo"
): Promise<void> {
    await routeMockSponsorSegments(context, defaultMockBvid, [
        {
            segment: [5, 20],
            UUID: `mock-${category}-segment`,
            category,
            actionType: "skip",
            cid: defaultMockCid,
            videoDuration: 120,
        },
    ]);
    await routeMockBilibiliVideoPage(page, { currentTime: 0, paused: false });
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);

    await expect
        .poll(async () => {
            const response = await sendContentMessage<{ status?: number; sponsorTimes?: unknown[] }>({
                message: "isInfoFound",
                updating: false,
            }).catch(() => undefined);
            return response?.status === 200 ? response.sponsorTimes?.length : undefined;
        })
        .toBe(1);
}

test("automatically skips a configured sponsor segment and supports undo/redo", async ({
    extensionContext,
    extensionPage,
    sendContentMessage,
}) => {
    await loadVideoWithSegment(extensionContext, extensionPage, sendContentMessage, "sponsor");

    await setMockVideoTime(extensionPage, 6, true);
    const notice = extensionPage.locator("[id^='sponsorSkipNoticeContainer']");
    await expect(notice).toHaveCount(1);
    await pauseMockVideo(extensionPage);
    expect(await getMockVideoTime(extensionPage)).toBeGreaterThanOrEqual(20);
    expect(await getMockVideoTime(extensionPage)).toBeLessThan(22);

    const undoButton = notice.locator("[id^='sponsorSkipUnskipButton']").first();
    await undoButton.click();
    await expect.poll(() => getMockVideoTime(extensionPage)).toBeCloseTo(5.001, 3);

    await undoButton.click();
    await expect.poll(() => getMockVideoTime(extensionPage)).toBe(20);

    await notice.locator(".sponsorSkipNoticeCloseButton").click();
    await expect(notice).toHaveCount(0);
});

test("shows a manual-skip notice and skips only after user interaction", async ({
    extensionContext,
    extensionPage,
    sendContentMessage,
}) => {
    await loadVideoWithSegment(extensionContext, extensionPage, sendContentMessage, "selfpromo");

    await setMockVideoTime(extensionPage, 6, true);
    const notice = extensionPage.locator("[id^='sponsorSkipNoticeContainer']");
    await expect(notice).toHaveCount(1);
    await pauseMockVideo(extensionPage);
    expect(await getMockVideoTime(extensionPage)).toBeGreaterThanOrEqual(6);
    expect(await getMockVideoTime(extensionPage)).toBeLessThan(20);

    await notice.locator("[id^='sponsorSkipUnskipButton']").first().click();
    await expect.poll(() => getMockVideoTime(extensionPage)).toBe(20);
});

test("does not schedule skips when skipping is disabled", async ({
    extensionContext,
    extensionPage,
    extensionServiceWorker,
    sendContentMessage,
}) => {
    await writeSyncStorage(extensionServiceWorker, { disableSkipping: true });
    await loadVideoWithSegment(extensionContext, extensionPage, sendContentMessage, "sponsor");

    await setMockVideoTime(extensionPage, 6, true);
    await extensionPage.waitForTimeout(300);
    await pauseMockVideo(extensionPage);
    expect(await getMockVideoTime(extensionPage)).toBeGreaterThanOrEqual(6);
    expect(await getMockVideoTime(extensionPage)).toBeLessThan(7);
    await expect(extensionPage.locator("[id^='sponsorSkipNoticeContainer']")).toHaveCount(0);
});

test("keeps a manual highlight button stable and updates its availability", async ({
    extensionContext,
    extensionPage,
    extensionServiceWorker,
    sendContentMessage,
}) => {
    await writeSyncStorage(extensionServiceWorker, {
        hideSkipButtonPlayerControls: false,
        skipNoticeDuration: 1,
    });
    await routeMockSponsorSegments(extensionContext, defaultMockBvid, [
        {
            segment: [34.8, 34.8],
            UUID: "mock-highlight-segment",
            category: "poi_highlight",
            actionType: "poi",
            cid: defaultMockCid,
            videoDuration: 120,
        },
    ]);
    await routeMockBilibiliVideoPage(extensionPage, { currentTime: 5, paused: true });
    await extensionPage.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(extensionPage, sendContentMessage);

    const highlightButton = extensionPage.locator(".skipButtonControlBarContainer");
    await expect(highlightButton).toBeVisible();
    await expect
        .poll(() =>
            highlightButton.evaluate((element) =>
                element.previousElementSibling?.classList.contains("bpx-player-ctrl-time")
            )
        )
        .toBe(true);

    await extensionPage.waitForTimeout(1200);
    await expect(highlightButton).toBeVisible();

    const playButton = extensionPage.locator(".bpx-player-control-bottom-left .bpx-player-ctrl-play");
    const playButtonBeforeHover = await playButton.boundingBox();
    await extensionPage.locator(".bpx-player-control-bottom-left").hover({ position: { x: 1, y: 1 } });
    const playButtonAfterHover = await playButton.boundingBox();
    expect(playButtonBeforeHover).not.toBeNull();
    expect(playButtonAfterHover).not.toBeNull();
    expect(playButtonAfterHover!.x).toBeCloseTo(playButtonBeforeHover!.x, 3);

    await writeSyncStorage(extensionServiceWorker, { hideSkipButtonPlayerControls: true });
    await expect(highlightButton).toHaveClass(/sbhidden/);

    await writeSyncStorage(extensionServiceWorker, { hideSkipButtonPlayerControls: false });
    await expect(highlightButton).toBeVisible();

    await setMockVideoTime(extensionPage, 60);
    await extensionPage.locator("#bilibili-player video").dispatchEvent("timeupdate");
    await expect(highlightButton).toHaveClass(/sbhidden/);

    await setMockVideoTime(extensionPage, 5, true);
    await expect(highlightButton).toBeVisible();
});

for (const category of ["sponsor", "selfpromo"] as const) {
    test(`adapts ${category} notices and both preview bars to player size`, async ({
        extensionContext, extensionPage, extensionServiceWorker, sendContentMessage,
    }) => {
        await writeSyncStorage(extensionServiceWorker, { noticeVisibilityMode: 0, skipNoticeDuration: 60 });
        await loadVideoWithSegment(extensionContext, extensionPage, sendContentMessage, category);
        await extensionPage.addStyleTag({ content: `
            video { width: 100%; height: 100%; }
            .bpx-player-progress, .bpx-player-progress-schedule,
            .bpx-player-shadow-progress-area { width: auto; height: 3px; bottom: 10px; }
            .bpx-player-shadow-progress-area { bottom: 0; }
        ` });
        const resizePlayer = async (width: number, height: number) => {
            await extensionPage.locator("#bilibili-player").evaluate((element, size) => {
                element.style.width = `${size.width}px`;
                element.style.height = `${size.height}px`;
            }, { width, height });
        };
        // Cover a notice already open during resizing, and one created in a mini player.
        if (category === "selfpromo") await resizePlayer(320, 180);
        await setMockVideoTime(extensionPage, 6, true);
        const notice = extensionPage.locator(".sponsorSkipNoticeParent");
        await expect(notice).toHaveCount(1);
        await pauseMockVideo(extensionPage);
        if (category === "sponsor") await expect(notice).not.toHaveClass(/sponsorSkipNoticeCompact/);

        for (const [width, height] of [[320, 180], [240, 135], [480, 270], [640, 240]]) {
            await resizePlayer(width, height);
            await expect(notice).toHaveClass(/sponsorSkipNoticeCompact/);
            await notice.hover();
            await expect(notice.locator("[id^='sponsorSkipNoticeSecondRow']")).toBeVisible();
            await expect(notice.locator("[id^='sponsorSkipUnskipButton']").first()).toBeVisible();
            await expect(notice.locator(".sponsorSkipNoticeCloseButton")).toBeVisible();
            const playerBounds = await extensionPage.locator(".bpx-player-video-area").boundingBox();
            const noticeBounds = await notice.boundingBox();
            expect(noticeBounds.x).toBeGreaterThanOrEqual(playerBounds.x);
            expect(noticeBounds.x + noticeBounds.width).toBeLessThanOrEqual(playerBounds.x + width);
            expect(noticeBounds.y).toBeGreaterThanOrEqual(playerBounds.y);
            expect(noticeBounds.height).toBeLessThanOrEqual(height - 44);
            expect(await notice.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
            for (const id of ["previewbar", "shadowPreviewbar"]) {
                const bar = extensionPage.locator(`#${id}`);
                await expect(bar).toHaveCount(1);
                const bounds = await bar.boundingBox();
                const segment = await bar.locator(".previewbar").boundingBox();
                expect(bounds.width).toBeCloseTo(width - 32, 0);
                expect(segment.x - bounds.x).toBeCloseTo(bounds.width * 5 / 120, 0);
                expect(segment.width).toBeCloseTo(bounds.width * 15 / 120, 0);
            }
        }
        await resizePlayer(960, 540);
        await expect(notice).not.toHaveClass(/sponsorSkipNoticeCompact/);
        await expect(notice.locator("[id^='sponsorSkipNoticeSecondRow']")).toBeVisible();
        await resizePlayer(320, 180);
        await expect(notice).toHaveClass(/sponsorSkipNoticeCompact/);
        await notice.locator("[id^='sponsorSkipUnskipButton']").first().click();
        await expect.poll(() => getMockVideoTime(extensionPage)).toBeCloseTo(category === "sponsor" ? 5.001 : 20, 3);
        await notice.locator(".sponsorSkipNoticeCloseButton").click();
        await expect(notice).toHaveCount(0);
    });
}

test("renders segment colors on the mini player's separate progress bar", async ({
    extensionContext, extensionPage, extensionServiceWorker, sendContentMessage,
}, testInfo) => {
    await loadVideoWithSegment(extensionContext, extensionPage, sendContentMessage, "sponsor");
    await pauseMockVideo(extensionPage);
    const mainSegment = extensionPage.locator("#previewbar .previewbar");
    await expect(mainSegment).toHaveCount(1);
    const segmentColor = await mainSegment.evaluate((e) => getComputedStyle(e).backgroundColor);
    const originalHexColor = "#" + segmentColor.match(/\d+/g).slice(0, 3)
        .map((component) => Number(component).toString(16).padStart(2, "0")).join("");
    await extensionPage.addStyleTag({ content: `
        video { width: 100%; height: 100%; }
        .bpx-player-container[data-screen="mini"] .bpx-player-progress,
        .bpx-player-container[data-screen="mini"] .bpx-player-shadow-progress-area,
        .bpx-player-container[data-screen="mini"] [class^="bpx-player-control-bottom"] { display: none; }
        .bpx-player-mini-warp { position: absolute; inset: 0; z-index: 12; }
        .bpx-player-mini-progress { position: absolute; bottom: 0; left: 0; right: 0;
            height: 3px; background: rgba(255,255,255,.2); }
        .bpx-player-mini-progress-buffer, .bpx-player-mini-progress-tempo {
            position: absolute; inset: 0; transform: scaleX(.75); transform-origin: 0 0; }
        .bpx-player-mini-progress-buffer { background: rgba(255,255,255,.3); }
        .bpx-player-mini-progress-tempo { background: #00a1d6; }
    ` });
    for (let entry = 0; entry < 2; entry++) {
        await extensionPage.locator(".bpx-player-container").evaluate((player) => {
            const host = document.querySelector("#bilibili-player") as HTMLElement;
            host.style.width = "320px";
            host.style.height = "180px";
            player.setAttribute("data-screen", "mini");
            player.querySelector(".bpx-player-video-area").insertAdjacentHTML("beforeend", `
                <div class="bpx-player-mini-warp"><div class="bpx-player-mini-progress">
                    <div class="bpx-player-mini-progress-buffer"></div>
                    <div class="bpx-player-mini-progress-tempo"></div>
                </div></div>`);
        });
        await expect(extensionPage.locator("#previewbar")).toBeHidden();
        await expect(extensionPage.locator("#shadowPreviewbar")).toBeHidden();
        const mini = extensionPage.locator(".bpx-player-mini-progress #miniPreviewbar");
        await expect(mini).toHaveCount(1);
        const mark = mini.locator(".previewbar");
        await expect(mark).toBeVisible();
        await expect(mark).toHaveCSS("background-color", segmentColor);
        expect(segmentColor).not.toBe("rgba(0, 0, 0, 0)");
        const bounds = await mini.boundingBox();
        const markBounds = await mark.boundingBox();
        expect(bounds.width).toBe(320);
        expect(bounds.height).toBe(3);
        expect(markBounds.x - bounds.x).toBeCloseTo(320 * 5 / 120, 0);
        expect(markBounds.width).toBeCloseTo(320 * 15 / 120, 0);
        await expect(mini).toHaveCSS("pointer-events", "none");
        await expect(mini).toHaveCSS("z-index", "1");
        if (entry === 0) {
            await extensionPage.locator("#bilibili-player").screenshot({ path: testInfo.outputPath("mini-preview.png") });
        }
        const barTypes = await readSyncStorage<Record<string, { color: string; opacity: string }>>(
            extensionServiceWorker, "barTypes"
        );
        await writeSyncStorage(extensionServiceWorker, {
            barTypes: { ...barTypes, sponsor: { color: "#ff00ff", opacity: "0.25" } },
        });
        for (const id of ["previewbar", "shadowPreviewbar", "miniPreviewbar"]) {
            await expect(extensionPage.locator(`#${id} .previewbar`)).toHaveCSS("background-color", "rgb(255, 0, 255)");
            await expect(extensionPage.locator(`#${id} .previewbar`)).toHaveCSS("opacity", "0.25");
        }
        await writeSyncStorage(extensionServiceWorker, {
            barTypes: { ...barTypes, sponsor: { color: originalHexColor, opacity: "0.7" } },
        });
        await expect(mark).toHaveCSS("background-color", segmentColor);
        // Replacing the progress element must move the existing overlay, without duplicating it.
        await extensionPage.locator(".bpx-player-mini-progress").evaluate((progress) => {
            const replacement = progress.cloneNode(false);
            progress.replaceWith(replacement);
        });
        await expect(extensionPage.locator(".bpx-player-mini-progress #miniPreviewbar .previewbar")).toHaveCount(1);
        await extensionPage.locator(".bpx-player-mini-warp").evaluate((miniPlayer) => miniPlayer.remove());
        await expect(extensionPage.locator("#miniPreviewbar")).toHaveCount(0);
        await extensionPage.locator(".bpx-player-container").evaluate((player) => player.setAttribute("data-screen", "normal"));
        await expect(mainSegment).toBeVisible();
    }
});

for (const category of ["sponsor", "selfpromo"] as const) {
    test(`honors all notice styles and live disabling for ${category} at both player sizes`, async ({
        extensionContext, extensionPage, extensionServiceWorker, sendContentMessage,
    }) => {
        await writeSyncStorage(extensionServiceWorker, { noticeVisibilityMode: 4, skipNoticeDuration: 60 });
        await loadVideoWithSegment(extensionContext, extensionPage, sendContentMessage, category);
        await setMockVideoTime(extensionPage, 6, true);
        await pauseMockVideo(extensionPage);
        const notice = extensionPage.locator(".sponsorSkipNoticeParent");
        await expect(notice).toHaveCount(1);
        await extensionPage.mouse.move(1200, 650);
        for (const mode of [0, 1, 2, 3, 4]) {
            await writeSyncStorage(extensionServiceWorker, { noticeVisibilityMode: mode });
            const small = mode >= 2 || (mode >= 1 && category === "sponsor");
            const faded = mode >= 4 || (mode >= 3 && category === "sponsor");
            for (const [width, height] of [[320, 180], [960, 540]]) {
                await extensionPage.locator("#bilibili-player").evaluate((e, size) => {
                    e.style.width = `${size[0]}px`;
                    e.style.height = `${size[1]}px`;
                }, [width, height]);
                await expect(notice).toHaveClass(width === 320 ? /sponsorSkipNoticeCompact/ : /^(?!.*sponsorSkipNoticeCompact)/);
                const details = notice.locator("[id^='sponsorSkipNoticeSecondRow']");
                if (small) await expect(details).toBeHidden();
                else await expect(details).toBeVisible();
                const panel = notice.locator(".sponsorSkipNoticeTableContainer");
                await expect(panel).toHaveCSS("opacity", faded ? "0.5" : "1");
            }
        }
        await extensionPage.locator("#bilibili-player").evaluate((e) => { e.style.width = "320px"; e.style.height = "180px"; });
        await writeSyncStorage(extensionServiceWorker, { dontShowNotice: true });
        await expect(notice).toHaveCount(0);
        await setMockVideoTime(extensionPage, 0, true);
        await setMockVideoTime(extensionPage, 6, true);
        await pauseMockVideo(extensionPage);
        await expect(notice).toHaveCount(0);
    });
}

test("disabling notices suppresses advance notices and still automatically skips", async ({
    extensionContext, extensionPage, extensionServiceWorker, sendContentMessage,
}) => {
    await writeSyncStorage(extensionServiceWorker, {
        dontShowNotice: true, advanceSkipNotice: true, skipNoticeDurationBefore: 10,
    });
    await loadVideoWithSegment(extensionContext, extensionPage, sendContentMessage, "sponsor");
    await extensionPage.locator("#bilibili-player").evaluate((e) => { e.style.width = "320px"; e.style.height = "180px"; });
    await extensionPage.evaluate(() => {
        (window as Window & { noticeSeen?: boolean }).noticeSeen = false;
        new MutationObserver(() => {
            if (document.querySelector(".sponsorSkipNoticeContainer")) {
                (window as Window & { noticeSeen?: boolean }).noticeSeen = true;
            }
        }).observe(document.body, { childList: true, subtree: true });
    });
    await expect.poll(() => getMockVideoTime(extensionPage), { timeout: 10000 }).toBeGreaterThanOrEqual(20);
    expect(await extensionPage.evaluate(() => (window as Window & { noticeSeen?: boolean }).noticeSeen)).toBe(false);
    await expect(extensionPage.locator(".sponsorSkipNoticeContainer")).toHaveCount(0);
});

test("uses the configured notice duration after switching to a mini player", async ({
    extensionContext, extensionPage, extensionServiceWorker, sendContentMessage,
}) => {
    await writeSyncStorage(extensionServiceWorker, { skipNoticeDuration: 60 });
    await loadVideoWithSegment(extensionContext, extensionPage, sendContentMessage, "sponsor");
    await setMockVideoTime(extensionPage, 6, true);
    await pauseMockVideo(extensionPage);
    const notice = extensionPage.locator(".sponsorSkipNoticeParent");
    await expect(notice).toHaveCount(1);
    await extensionPage.locator("#bilibili-player").evaluate((e) => { e.style.width = "320px"; e.style.height = "180px"; });
    await expect(notice).toHaveClass(/sponsorSkipNoticeCompact/);
    await writeSyncStorage(extensionServiceWorker, { skipNoticeDuration: 1 });
    await expect(notice).toHaveCount(0, { timeout: 4000 });
});
