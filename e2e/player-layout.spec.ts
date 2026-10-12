import { expect, test } from "./fixtures/extension";
import { defaultMockBvid, routeMockBilibiliVideoPage } from "./support/bilibiliPage";
import { writeSyncStorage } from "./support/extensionStorage";
import { getLifecycleLogs, findLifecycleIndex } from "./support/lifecycle";

test("attaches controls after CSS-only hover reveals an initially hidden native host", async ({
    extensionPage: page, extensionServiceWorker, sendContentMessage,
}) => {
    await writeSyncStorage(extensionServiceWorker, { autoHideInfoButton: false });
    await routeMockBilibiliVideoPage(page, { extraCss: `
        .bpx-player-control-bottom-right { display: none !important; }
        .bpx-player-container:hover .bpx-player-control-bottom-right { display: flex !important; }
    ` });
    await page.mouse.move(1200, 650);
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await expect.poll(async () => findLifecycleIndex(await getLifecycleLogs(sendContentMessage), "pageReady/ready"))
        .toBeGreaterThanOrEqual(0);
    await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(1);
    await expect(page.locator(".bpx-player-control-bottom-right")).toBeHidden();
    // Let initial hydration/media checks finish before changing only :hover.
    await page.waitForTimeout(500);
    await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(0);
    await page.locator("#bilibili-player").hover({ position: { x: 200, y: 200 } });
    await expect(page.locator("#startSegmentButton")).toBeVisible();
    await expect(page.locator("#previewbar")).toHaveCount(1);
    await page.mouse.move(1200, 650);
    await expect(page.locator(".bpx-player-control-bottom-right")).toBeHidden();
    await page.waitForTimeout(500);
    await page.locator("#bilibili-player").hover({ position: { x: 200, y: 200 } });
    await expect(page.locator("#startSegmentButton")).toBeVisible();
    await expect.poll(async () => (await getLifecycleLogs(sendContentMessage))
        .filter(entry => entry.stage === "playerUI/ready").length).toBe(2);
    await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(1);
    await expect(page.locator("#previewbar")).toHaveCount(1);
});

test("attaches controls after an ancestor's layout changes through the CSSOM", async ({
    extensionPage: page, extensionServiceWorker, sendContentMessage,
}) => {
    await writeSyncStorage(extensionServiceWorker, { autoHideInfoButton: false });
    await routeMockBilibiliVideoPage(page, { extraCss: "#bilibili-player { display: none; }" });
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await expect.poll(async () => findLifecycleIndex(await getLifecycleLogs(sendContentMessage), "pageReady/ready"))
        .toBeGreaterThanOrEqual(0);
    await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(500);
    await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(0);
    await page.evaluate(() => {
        const sheet = document.querySelector<HTMLStyleElement>("#bsb-e2e-page-style").sheet;
        // CSSOM edits do not generate DOM mutations, resize or visibility events.
        sheet.insertRule("#bilibili-player { display: block; }", sheet.cssRules.length);
    });
    await expect(page.locator("#bilibili-player")).toBeVisible();
    await expect(page.locator("#startSegmentButton")).toBeVisible();
    await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(1);
    await expect(page.locator("#previewbar")).toHaveCount(1);
});
