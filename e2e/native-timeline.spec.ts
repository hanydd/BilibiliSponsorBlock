import { expect, test } from "./fixtures/extension";
import { defaultMockBvid, defaultMockCid, routeMockBilibiliVideoPage } from "./support/bilibiliPage";
import { routeMockSponsorSegments } from "./support/sponsorBlockApi";
import { writeSyncStorage } from "./support/extensionStorage";
import { waitForBilibiliContentScript } from "./support/submissionNotice";

test("follows a trial-sized or full native axis and clips marks when only the native total changes", async ({
    extensionPage: page, extensionContext, extensionServiceWorker, sendContentMessage,
}) => {
    await writeSyncStorage(extensionServiceWorker, { showTimeWithSkips: true, autoHideInfoButton: false });
    await routeMockBilibiliVideoPage(page);
    await routeMockSponsorSegments(extensionContext, defaultMockBvid, [
        { segment: [25, 35], actionType: "skip", category: "sponsor" },
        { segment: [30, 30], actionType: "poi", category: "poi_highlight" },
        { segment: [200, 210], actionType: "skip", category: "sponsor" },
    ].map((segment, i) => ({ ...segment, segment: segment.segment as [number, number],
        actionType: segment.actionType as "skip" | "poi", cid: defaultMockCid,
        UUID: String(i + 1).repeat(64), videoDuration: 600,
    })));
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await page.locator(".bpx-player-ctrl-time").evaluate((time: HTMLElement) => {
        time.innerHTML = '<span class="bpx-player-ctrl-time-label"><span class="bpx-player-ctrl-time-current">00:15</span> / <span class="bpx-player-ctrl-time-duration">02:00</span></span>';
    });
    await waitForBilibiliContentScript(page, sendContentMessage);
    await sendContentMessage({ message: "refreshSegments" });
    await expect(page.locator("#previewbar > li")).toHaveCount(2);
    await expect.poll(() => page.locator('#previewbar [sponsorblock-category="poi_highlight"]')
        .evaluate((point: HTMLElement) => parseFloat(point.style.left))).toBeCloseTo(25, 3);
    // 120 seconds of media; the full source's 200-second mark is outside the native bar.
    await expect(page.locator("#sponsorBlockDurationAfterSkips")).toHaveText(" (1:50)");
    await page.locator(".bpx-player-ctrl-time").evaluate((time: HTMLElement) => {
        time.innerHTML = '<span class="bpx-player-ctrl-time-label"><span class="bpx-player-ctrl-time-current">00:15</span> / <span class="bpx-player-ctrl-time-duration">10:00</span></span>';
    });
    await expect(page.locator("#previewbar > li")).toHaveCount(3);
    await expect.poll(() => page.locator('#previewbar [sponsorblock-category="poi_highlight"]')
        .evaluate((point: HTMLElement) => parseFloat(point.style.left))).toBeCloseTo(5, 3);
    await expect(page.locator("#sponsorBlockDurationAfterSkips")).toHaveText(" (9:40)");
    await page.locator(".bpx-player-ctrl-time-duration").evaluate((label) => { label.textContent = "01:00"; });
    await expect(page.locator("#previewbar > li")).toHaveCount(2);
    await expect.poll(() => page.locator('#previewbar [sponsorblock-category="poi_highlight"]')
        .evaluate((point: HTMLElement) => parseFloat(point.style.left))).toBeCloseTo(50, 3);
    await expect(page.locator("#sponsorBlockDurationAfterSkips")).toHaveText(" (0:50)");
    await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(1);
    await expect(page.locator("#shadowPreviewbar > li")).toHaveCount(2);
    expect(await page.locator("video").first().evaluate((video: HTMLVideoElement) => video.duration)).toBe(120);
});
