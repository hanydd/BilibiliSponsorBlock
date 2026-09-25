import { expect, test } from "./fixtures/extension";
import { writeSyncStorage } from "./support/extensionStorage";
import { openEmbeddedPopup } from "./support/popup";
import { openRealBilibiliPage } from "./support/realBilibili";
import { waitForBilibiliContentScript } from "./support/submissionNotice";

test("@real popup follows wide mode on the real Bilibili player", async ({
    extensionPage: page,
    extensionServiceWorker,
    sendContentMessage,
}, testInfo) => {
    testInfo.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 1080 });
    await writeSyncStorage(extensionServiceWorker, { autoHideInfoButton: false });
    await openRealBilibiliPage(page, testInfo,
        process.env.BSB_E2E_REAL_VIDEO_URL?.trim() || "https://www.bilibili.com/video/BV1JfLg6qEtf/");
    await waitForBilibiliContentScript(page, sendContentMessage);
    const player = page.locator(".bpx-player-container");
    const wideButton = page.locator(".bpx-player-ctrl-wide");
    if (await player.getAttribute("data-screen") === "wide") await wideButton.click({ force: true });
    await expect(player).toHaveAttribute("data-screen", "normal");
    const popup = await openEmbeddedPopup(page);
    const container = page.locator("#sponsorBlockPopupContainer");
    await expect(container.locator("..")).toHaveAttribute("id", "danmukuBox");
    await expect(popup.locator(".anticon-spin")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("normal.png") });

    await wideButton.click({ force: true });
    await expect(player).toHaveAttribute("data-screen", "wide");
    await expect(container).toHaveClass("sb-popup-wide");
    await expect(popup.locator("#mainControls")).toBeVisible();
    for (const width of [1440, 1920]) {
        await page.setViewportSize({ width, height: 1080 });
        await expect.poll(async () => {
            const panel = await container.boundingBox();
            const video = await page.locator(".bpx-player-video-area").boundingBox();
            return panel && video && panel.x >= video.x && panel.x + panel.width <= video.x + video.width
                && panel.y >= video.y && panel.y + panel.height <= video.y + video.height;
        }).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`wide-${width}.png`) });
    }
    // The live site's redraw may discard extension-inserted children.
    await container.evaluate((element) => element.remove());
    await expect(container).toHaveClass("sb-popup-wide");
    await expect(popup.locator("#mainControls")).toBeVisible();
    await popup.locator("#toggleSwitch").click();
    await expect(popup.locator("#toggleSwitch")).toHaveAttribute("aria-checked", "false");
    await wideButton.click({ force: true });
    await expect(container.locator("..")).toHaveAttribute("id", "danmukuBox");
    await expect(popup.locator("#mainControls")).toBeVisible();
    await popup.locator(".sbCloseButton").click();
    await expect(container).toHaveCount(0);
});
