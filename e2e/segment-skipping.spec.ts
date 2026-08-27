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
import { writeSyncStorage } from "./support/extensionStorage";
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
