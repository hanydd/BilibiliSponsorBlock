import { expect, test } from "./fixtures/extension";
import {
    defaultMockBvid,
    routeMockBilibiliVideoPage,
} from "./support/bilibiliPage";
import { writeSyncStorage } from "./support/extensionStorage";
import { findLifecycleIndex, getLifecycleLogs } from "./support/lifecycle";
import { waitForBilibiliContentScript } from "./support/submissionNotice";

test("waits for Vue3 hydration before mounting into reconciled player controls", async ({
    extensionPage,
    extensionServiceWorker,
    sendContentMessage,
}) => {
    await writeSyncStorage(extensionServiceWorker, { autoHideInfoButton: false });
    await routeMockBilibiliVideoPage(extensionPage, {
        vueHydrationDelayMs: 3500,
        replacePlayerControlsOnHydration: true,
    });

    await extensionPage.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`, {
        waitUntil: "domcontentloaded",
    });
    await expect(extensionPage.locator("#bilibili-player video")).toBeVisible();
    await expect(extensionPage.locator(".bpx-player-control-bottom-right")).toHaveAttribute(
        "data-e2e-generation",
        "ssr"
    );
    await expect(extensionPage.locator("#bsbPlayerButtonContainer")).toHaveCount(0);

    const logsBeforeHydration = await getLifecycleLogs(sendContentMessage);
    expect(findLifecycleIndex(logsBeforeHydration, "pageReady/ready")).toBe(-1);

    await expect(extensionPage.locator("#app")).toHaveAttribute("data-e2e-hydrated", "true");
    await waitForBilibiliContentScript(extensionPage, sendContentMessage);

    const buttonContainer = extensionPage.locator("#bsbPlayerButtonContainer");
    await expect(buttonContainer).toHaveCount(1);
    await expect(extensionPage.locator("#startSegmentButton")).toBeVisible();
    await expect(buttonContainer.locator("..")).toHaveAttribute("data-e2e-generation", "hydrated");

    const logs = await getLifecycleLogs(sendContentMessage);
    const mainWorldSignal = findLifecycleIndex(logs, "pageReady/state", {
        action: "mainWorldSignal",
        stage: "main/pageReadyDetected",
        vue3: true,
    });
    const pageReady = findLifecycleIndex(logs, "pageReady/ready");
    const playerReady = findLifecycleIndex(logs, "playerUI/ready");
    const buttonsAttached = findLifecycleIndex(logs, "playerButtons/attach");

    expect(mainWorldSignal).toBeGreaterThanOrEqual(0);
    expect(pageReady).toBeGreaterThan(mainWorldSignal);
    expect(playerReady).toBeGreaterThan(pageReady);
    expect(buttonsAttached).toBeGreaterThan(playerReady);
});
