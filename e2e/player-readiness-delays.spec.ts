import { expect, test } from "./fixtures/extension";
import { defaultMockBvid, defaultMockCid, routeMockBilibiliVideoPage } from "./support/bilibiliPage";
import { writeSyncStorage } from "./support/extensionStorage";
import * as shippedServers from "../ota/servers.json";

test("restores a late time anchor after replacing its control host, without delaying other UI", async ({
    extensionPage: page, extensionServiceWorker,
}) => {
    await writeSyncStorage(extensionServiceWorker, { autoHideInfoButton: false });
    await routeMockBilibiliVideoPage(page, { vueHydrationDelayMs: 2000 });
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`, { waitUntil: "domcontentloaded" });
    await page.locator(".bpx-player-ctrl-time").evaluate(node => node.remove());
    await expect(page.locator("#startSegmentButton")).toBeVisible();
    await expect(page.locator("#previewbar")).toHaveCount(1);
    await expect(page.locator(".skipButtonControlBarContainer")).toHaveCount(0);
    await page.locator(".bpx-player-control-bottom-left").evaluate(node => node.replaceWith(node.cloneNode(true)));
    // The previous component-local anchor wait gave up after ten seconds.
    await page.waitForTimeout(11000);
    await page.locator(".bpx-player-control-bottom-left").evaluate(node => {
        const time = document.createElement("div");
        time.className = "bpx-player-ctrl-time";
        time.textContent = "00:15 / 02:00";
        node.append(time);
    });
    await expect(page.locator(".bpx-player-ctrl-time + .skipButtonControlBarContainer")).toHaveCount(1);
    await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(1);
    await expect(page.locator("#previewbar")).toHaveCount(1);
});

test("waits for delayed media metadata and resumes after the response arrives", async ({
    extensionPage: page, extensionServiceWorker,
}) => {
    await writeSyncStorage(extensionServiceWorker, { autoHideInfoButton: false });
    await routeMockBilibiliVideoPage(page);
    let release: () => void;
    const response = new Promise<void>(resolve => { release = resolve; });
    await page.route("https://www.bilibili.com/e2e/mock-video.webm", async route => {
        await response;
        await route.fallback();
    });
    try {
        await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("#app")).toHaveAttribute("data-e2e-hydrated", "true");
        await page.waitForTimeout(11000);
        await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(0);
        // A track can mount before metadata; no marks are drawn on an unknown axis.
        await expect(page.locator("#previewbar > li")).toHaveCount(0);
        release();
        await expect(page.locator("#startSegmentButton")).toBeVisible();
        await expect(page.locator(".skipButtonControlBarContainer")).toHaveCount(1);
        await expect(page.locator("#previewbar")).toHaveCount(1);
    } finally { release(); }
});

test("mounts controls independently of a slow segment API and renders the late response", async ({
    extensionPage: page, extensionContext, extensionServiceWorker,
}) => {
    await writeSyncStorage(extensionServiceWorker, { autoHideInfoButton: false });
    await routeMockBilibiliVideoPage(page);
    let release: () => void;
    let requests = 0;
    const response = new Promise<void>(resolve => { release = resolve; });
    // Include failover servers: the primary hash request times out at six seconds.
    const officialOrigins = new Set(shippedServers.data.nodes.map(node => new URL(node.address).origin));
    await extensionContext.route(url => officialOrigins.has(url.origin) && url.pathname.startsWith("/api/skipSegments/"), async route => {
        requests += 1;
        await response;
        await route.fulfill({ contentType: "application/json", body: JSON.stringify([{ videoID: defaultMockBvid,
            segments: [{ segment: [30, 30], UUID: "1".repeat(64), category: "poi_highlight", actionType: "poi",
                cid: defaultMockCid, videoDuration: 120 }],
        }]) });
    });
    try {
        await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
        await expect.poll(() => requests).toBeGreaterThan(0);
        await expect(page.locator("#startSegmentButton")).toBeVisible();
        await expect(page.locator("#previewbar > li")).toHaveCount(0);
        await page.waitForTimeout(6000);
        release();
        await expect(page.locator('#previewbar [sponsorblock-category="poi_highlight"]')).toHaveCount(1);
        await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(1);
    } finally { release(); }
});
