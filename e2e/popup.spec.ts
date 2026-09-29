import { expect, test } from "./fixtures/extension";
import {
    defaultMockBvid,
    defaultMockChannelId,
    routeMockBilibiliVideoPage,
    setMockVideoTime,
} from "./support/bilibiliPage";
import { readSyncStorage, writeSyncStorage } from "./support/extensionStorage";
import { openEmbeddedPopup } from "./support/popup";
import { closeSubmissionNotice, waitForBilibiliContentScript } from "./support/submissionNotice";

test.beforeEach(async ({ extensionPage, extensionServiceWorker, sendContentMessage }) => {
    await writeSyncStorage(extensionServiceWorker, { autoHideInfoButton: false });
    await routeMockBilibiliVideoPage(extensionPage);
    await extensionPage.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(extensionPage, sendContentMessage);
});

test("opens and closes the embedded popup from the player info button", async ({ extensionPage }) => {
    const popup = await openEmbeddedPopup(extensionPage);

    await expect(popup.locator("#sponsorBlockPopupLogo")).toBeVisible();
    await expect(popup.locator("#mainControls")).toBeVisible();
    await expect(popup.locator("#toggleSwitch")).toBeVisible();

    await popup.locator(".sbCloseButton").click();
    await expect(extensionPage.locator("#sponsorBlockPopupContainer")).toHaveCount(0);
    await expect(extensionPage.locator("#infoButton")).toBeVisible();
});

test("fits the embedded popup within a narrow sidebar", async ({ extensionPage }) => {
    await extensionPage.locator("#danmukuBox").evaluate((element) => {
        (element as HTMLElement).style.width = "320px";
    });

    const popup = await openEmbeddedPopup(extensionPage);
    const popupContainer = extensionPage.locator("#sponsorBlockPopupContainer");
    const frame = popupContainer.locator("iframe");

    await expect
        .poll(() =>
            frame.evaluate((iframe) => ({
                containerWidth: iframe.parentElement.clientWidth,
                frameWidth: iframe.offsetWidth,
            }))
        )
        .toEqual({ containerWidth: 320, frameWidth: 320 });
    await expect
        .poll(() => popup.locator("html").evaluate((html) => html.scrollWidth === html.clientWidth))
        .toBe(true);
});

test("toggles skipping from the popup and persists the setting", async ({
    extensionPage,
    extensionServiceWorker,
}) => {
    const popup = await openEmbeddedPopup(extensionPage);
    const toggle = popup.locator("#toggleSwitch");

    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect.poll(() => readSyncStorage<boolean>(extensionServiceWorker, "disableSkipping")).toBe(true);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => readSyncStorage<boolean>(extensionServiceWorker, "disableSkipping")).toBe(false);
});

test("imports a segment through the popup", async ({ extensionPage, extensionServiceWorker }) => {
    const popup = await openEmbeddedPopup(extensionPage);
    const sponsorCategoryName = await extensionServiceWorker.evaluate(() => {
        const chromeApi = (globalThis as { chrome: typeof chrome }).chrome;
        return chromeApi.i18n.getMessage("category_sponsor_short") || chromeApi.i18n.getMessage("category_sponsor");
    });

    await popup.locator("#issueReporterImportExport > div button").first().click();
    await popup.locator("#importSegmentsText").fill(`0:10 - 0:20 ${sponsorCategoryName}`);
    await popup.locator("#importSegmentsMenu button").click();

    await expect(extensionPage.locator("#submissionNoticeContainer")).toHaveCount(1);
    await expect(extensionPage.locator("#sponsorTimeCategoriesSubmissionNotice0")).toHaveValue("sponsor");
    await closeSubmissionNotice(extensionPage);
});

test("records a segment through the popup and opens its submission editor", async ({ extensionPage }) => {
    const popup = await openEmbeddedPopup(extensionPage);
    const recordButton = popup.locator("#mainControls .sbMediumButton").first();

    await recordButton.click();
    await setMockVideoTime(extensionPage, 24);
    await recordButton.click();

    const submitButton = popup.locator("#submitTimes");
    await expect(submitButton).toBeVisible();
    await submitButton.click();
    await expect(extensionPage.locator("#submissionNoticeContainer")).toHaveCount(1);
    await closeSubmissionNotice(extensionPage);
});

test("adds and removes the current channel from the whitelist", async ({
    extensionPage,
    extensionServiceWorker,
}) => {
    const popup = await openEmbeddedPopup(extensionPage);
    const whitelistControl = popup.locator(".sbControlsMenu > label.sbControlsMenu-item").first();
    const whitelistIcon = whitelistControl.locator(".SBWhitelistIcon");
    await expect(whitelistControl).toBeVisible();

    await whitelistControl.click();
    await expect(whitelistIcon).toHaveClass(/rotated/);
    await expect
        .poll(() => readSyncStorage<Array<{ id: string; name: string }>>(extensionServiceWorker, "whitelistedChannels"))
        .toEqual([{ id: defaultMockChannelId, name: "Mock UP" }]);

    await whitelistControl.click();
    await expect(whitelistIcon).not.toHaveClass(/rotated/);
    await expect
        .poll(() => readSyncStorage<Array<{ id: string; name: string }>>(extensionServiceWorker, "whitelistedChannels"))
        .toEqual([]);
});

test("moves only in wide mode and preserves the open form across mode changes", async ({ extensionPage }) => {
    const popup = await openEmbeddedPopup(extensionPage);
    await popup.locator("#issueReporterImportExport > div button").first().click();
    await popup.locator("#importSegmentsText").fill("0:10 - 0:20 draft");
    const player = extensionPage.locator(".bpx-player-container");
    const container = extensionPage.locator("#sponsorBlockPopupContainer");

    await player.evaluate((element) => element.setAttribute("data-screen", "wide"));
    await expect(container).toHaveClass("sb-popup-wide");
    await expect(container.locator("..")).toHaveClass("bpx-player-video-area");
    await expect(popup.locator("#importSegmentsText")).toHaveValue("0:10 - 0:20 draft");

    for (const mode of ["normal", "web", "full"]) {
        await player.evaluate((element, screen) => element.setAttribute("data-screen", screen), mode);
        await expect(container.locator("..")).toHaveAttribute("id", "danmukuBox");
        await expect(container).not.toHaveClass("sb-popup-wide");
    }
    await expect(popup.locator("#importSegmentsText")).toHaveValue("0:10 - 0:20 draft");
});

test("recovers after wide-player and sidebar hosts are removed and recreated", async ({ extensionPage }) => {
    const popup = await openEmbeddedPopup(extensionPage);
    const container = extensionPage.locator("#sponsorBlockPopupContainer");
    const player = extensionPage.locator(".bpx-player-container");
    await player.evaluate((element) => element.setAttribute("data-screen", "wide"));
    await expect(container).toHaveClass("sb-popup-wide");

    for (const selector of [".bpx-player-video-area", "#danmukuBox"]) {
        if (selector === "#danmukuBox") {
            await player.evaluate((element) => element.setAttribute("data-screen", "normal"));
            await expect(container.locator("..")).toHaveAttribute("id", "danmukuBox");
        }
        await extensionPage.locator(selector).evaluate((host) => {
            const replacement = host.cloneNode(true) as HTMLElement;
            replacement.querySelector("#sponsorBlockPopupContainer")?.remove();
            const parent = host.parentElement;
            host.remove();
            setTimeout(() => parent.appendChild(replacement), 100);
        });
        await expect(container).toHaveCount(1);
        await expect(popup.locator("#mainControls")).toBeVisible();
        await popup.locator("#toggleSwitch").click();
        await expect(popup.locator("#toggleSwitch")).toHaveAttribute("aria-checked", selector === "#danmukuBox" ? "true" : "false");
    }

    await popup.locator(".sbCloseButton").click();
    await player.evaluate((element) => element.setAttribute("data-screen", "wide"));
    await extensionPage.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(container).toHaveCount(0);
});

test("opens inside a short wide player and closes when opening the submission editor", async ({ extensionPage }) => {
    await extensionPage.locator("#bilibili-player").evaluate((element) => {
        element.style.width = "600px";
        element.style.height = "300px";
    });
    await extensionPage.locator(".bpx-player-container").evaluate((element) => element.setAttribute("data-screen", "wide"));
    const popup = await openEmbeddedPopup(extensionPage);
    const container = extensionPage.locator("#sponsorBlockPopupContainer");
    await expect(container).toHaveClass("sb-popup-wide");
    const bounds = await container.boundingBox();
    const playerBounds = await extensionPage.locator(".bpx-player-video-area").boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(playerBounds.x);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(playerBounds.y + playerBounds.height - 60);
    await popup.locator("#issueReporterImportExport > div button").first().click();
    await popup.locator("#importSegmentsText").fill("0:10 - 0:20 sponsor");
    await popup.locator("#importSegmentsMenu button").click();
    await expect(extensionPage.locator("#submissionNoticeContainer")).toHaveCount(1);
    await expect(container).toHaveCount(0);
});
