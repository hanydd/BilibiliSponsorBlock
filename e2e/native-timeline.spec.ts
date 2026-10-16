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
    const point = await page.locator('#previewbar [sponsorblock-category="poi_highlight"]').elementHandle();
    await page.locator(".bpx-player-ctrl-time").evaluate((time: HTMLElement) => {
        const replacement = time.cloneNode(true) as HTMLElement;
        replacement.querySelector("#sponsorBlockDurationAfterSkips").remove();
        time.replaceWith(replacement);
    });
    await expect(page.locator("#sponsorBlockDurationAfterSkips")).toHaveText(" (0:50)");
    // Restoring time text must preserve the rendered segment nodes.
    expect(await point.evaluate(node => node.isConnected)).toBe(true);
    // Keep the time-control host and native total unchanged; only replace its label.
    await page.locator(".bpx-player-ctrl-time-label").evaluate(label => {
        label.innerHTML = '<span class="bpx-player-ctrl-time-current">00:15</span> / <span class="bpx-player-ctrl-time-duration">01:00</span>';
    });
    await expect(page.locator("#sponsorBlockDurationAfterSkips")).toHaveText(" (0:50)");
    expect(await point.evaluate(node => node.isConnected)).toBe(true);
    await page.locator("#sponsorBlockDurationAfterSkips").evaluate(node => node.remove());
    await expect(page.locator("#sponsorBlockDurationAfterSkips")).toHaveText(" (0:50)");
    expect(await point.evaluate(node => node.isConnected)).toBe(true);
});

test("attaches a late or replaced shadow host while controls stay collapsed", async ({
    extensionPage: page, extensionContext, extensionServiceWorker, sendContentMessage,
}) => {
    await writeSyncStorage(extensionServiceWorker, { autoHideInfoButton: false });
    await routeMockBilibiliVideoPage(page, { vueHydrationDelayMs: 2000 });
    await routeMockSponsorSegments(extensionContext, defaultMockBvid, [{
        segment: [30, 30], actionType: "poi", category: "poi_highlight", cid: defaultMockCid,
        UUID: "1".repeat(64), videoDuration: 120,
    }]);
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`, { waitUntil: "domcontentloaded" });
    await page.locator(".bpx-player-shadow-progress-area").evaluate(node => node.remove());
    await waitForBilibiliContentScript(page, sendContentMessage);
    await sendContentMessage({ message: "refreshSegments" });
    // Timeline colors no longer wait for the full control panel to become ready.
    await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(1);
    const point = await page.locator('#previewbar [sponsorblock-category="poi_highlight"]').elementHandle();
    await expect(page.locator("#shadowPreviewbar")).toHaveCount(0);
    await page.locator(".bpx-player-control-bottom-right").evaluate((node: HTMLElement) => { node.style.display = "none"; });
    await page.waitForTimeout(250);
    for (let i = 0; i < 2; i++) {
        await page.locator(".bpx-player-video-area").evaluate(node => {
            const shadow = document.createElement("div");
            shadow.className = "bpx-player-shadow-progress-area";
            const old = node.querySelector(".bpx-player-shadow-progress-area");
            if (old) old.replaceWith(shadow); else node.append(shadow);
        });
        await expect(page.locator('#shadowPreviewbar [sponsorblock-category="poi_highlight"]')).toHaveCount(1);
        expect(await point.evaluate(node => node.isConnected)).toBe(true);
        await expect(page.locator("#previewbar")).toHaveCount(1);
        await expect(page.locator(".bpx-player-control-bottom-right")).toBeHidden();
    }
});

test("updates shadow marks while controls are hidden, for native labels and media duration", async ({
    extensionPage: page, extensionContext, extensionServiceWorker, sendContentMessage,
}) => {
    await writeSyncStorage(extensionServiceWorker, { autoHideInfoButton: false });
    await routeMockBilibiliVideoPage(page);
    await routeMockSponsorSegments(extensionContext, defaultMockBvid, [{
        segment: [30, 30], actionType: "poi", category: "poi_highlight", cid: defaultMockCid,
        UUID: "1".repeat(64), videoDuration: 240,
    }]);
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await page.locator(".bpx-player-ctrl-time").evaluate((time: HTMLElement) => {
        time.innerHTML = '<span class="bpx-player-ctrl-time-duration">02:00</span>';
    });
    await waitForBilibiliContentScript(page, sendContentMessage);
    await sendContentMessage({ message: "refreshSegments" });
    await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(1);
    const point = page.locator('#shadowPreviewbar [sponsorblock-category="poi_highlight"]');
    const position = () => point.evaluate((mark: HTMLElement) => parseFloat(mark.style.left));
    await expect.poll(position).toBeCloseTo(25, 3);
    await page.locator(".bpx-player-control-bottom-right").evaluate((controls: HTMLElement) => {
        controls.style.display = "none";
    });
    await page.locator(".bpx-player-control-bottom-right").waitFor({ state: "hidden" });
    await page.locator(".bpx-player-ctrl-time-duration").evaluate((label) => { label.textContent = "04:00"; });
    await expect.poll(position).toBeCloseTo(12.5, 3);
    // Property overrides must share the content script's isolated world;
    // setting duration in the page world does not affect extension reads.
    await extensionServiceWorker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: "https://www.bilibili.com/video/*" });
        await chrome.scripting.executeScript({
            target: { tabId: tab.id }, world: "ISOLATED",
            func: () => {
                document.querySelector(".bpx-player-ctrl-time-duration").remove();
                const video = document.querySelector("video");
                Object.defineProperty(video, "duration", { configurable: true, value: 60 });
                video.dispatchEvent(new Event("durationchange"));
            },
        });
    });
    await expect.poll(position).toBeCloseTo(50, 3);
    await expect(page.locator(".bpx-player-control-bottom-right")).toBeHidden();
    await expect(page.locator("#previewbar")).toHaveCount(1);
    await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(1);
});
