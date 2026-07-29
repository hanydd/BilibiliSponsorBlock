import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "./fixtures/extension";
import { writeSyncStorage } from "./support/extensionStorage";
import { findLifecycleIndex, getLifecycleLogs } from "./support/lifecycle";
import { openEmbeddedPopup } from "./support/popup";
import {
    assertSubmissionNoticeActionTypeSwitching,
    closeSubmissionNotice,
    openSubmissionNoticeWithImportedSegment,
    waitForBilibiliContentScript,
} from "./support/submissionNotice";

const realVideoUrl =
    process.env.BSB_E2E_REAL_VIDEO_URL?.trim() || "https://www.bilibili.com/video/BV1JfLg6qEtf/";

async function openRealBilibiliPage(page: Page, testInfo: TestInfo): Promise<void> {
    let responseStatus: number | null = null;
    try {
        const response = await page.goto(realVideoUrl, {
            waitUntil: "domcontentloaded",
            timeout: 60_000,
        });
        responseStatus = response?.status() ?? null;
    } catch (error) {
        throw new Error(
            `Unable to open the real Bilibili page. If a system proxy is interfering, retry with ` +
                `BSB_E2E_DIRECT=1. Original error: ${error instanceof Error ? error.message : String(error)}`
        );
    }

    const title = await page.title();
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const securityBlocked =
        responseStatus === 412 || /错误号\s*[:：]?\s*412|请求被拦截|访问被拒绝/.test(bodyText);
    const diagnostics = {
        requestedUrl: realVideoUrl,
        finalUrl: page.url(),
        responseStatus,
        title,
        securityBlocked,
        directConnection: process.env.BSB_E2E_DIRECT === "1",
        explicitProxy: Boolean(process.env.BSB_E2E_PROXY_SERVER),
    };

    console.log(`[e2e:real] ${JSON.stringify(diagnostics)}`);
    await testInfo.attach("bilibili-page-diagnostics", {
        body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
        contentType: "application/json",
    });

    test.skip(
        securityBlocked,
        "Bilibili returned a security-control page (usually HTTP 412). Retry from a trusted direct network with BSB_E2E_DIRECT=1."
    );
}

test.describe("@real real Bilibili rendering", () => {
    test.beforeEach(async ({ extensionPage, extensionServiceWorker }, testInfo) => {
        testInfo.setTimeout(120_000);
        await writeSyncStorage(extensionServiceWorker, { autoHideInfoButton: false });
        await openRealBilibiliPage(extensionPage, testInfo);
    });

    test("renders player controls only after detected Vue hydration and opens the embedded popup", async ({
        extensionPage,
        sendContentMessage,
    }, testInfo) => {
        const videoIdResponse = await waitForBilibiliContentScript(extensionPage, sendContentMessage);
        expect(videoIdResponse.videoID).not.toBeNull();

        const buttonContainer = extensionPage.locator("#bsbPlayerButtonContainer");
        await expect(buttonContainer).toHaveCount(1);
        await expect(extensionPage.locator("#startSegmentButton")).toBeVisible();
        await expect(extensionPage.locator("#infoButton")).toBeVisible();
        await expect(buttonContainer.locator("..")).toHaveClass(/bpx-player-control-bottom-right/);

        const logs = await getLifecycleLogs(sendContentMessage);
        await testInfo.attach("bilibili-extension-lifecycle", {
            body: Buffer.from(JSON.stringify(logs, null, 2)),
            contentType: "application/json",
        });
        const mainWorldSignal = findLifecycleIndex(logs, "pageReady/state", {
            action: "mainWorldSignal",
            stage: "main/pageReadyDetected",
        });
        const pageReady = findLifecycleIndex(logs, "pageReady/ready");
        const playerReady = findLifecycleIndex(logs, "playerUI/ready");
        const buttonsAttached = findLifecycleIndex(logs, "playerButtons/attach");
        const buttonsReady = findLifecycleIndex(logs, "playerButtons/ready");

        expect(mainWorldSignal).toBeGreaterThanOrEqual(0);
        expect(
            logs[mainWorldSignal].details.vue2 === true ||
                logs[mainWorldSignal].details.vue3 === true
        ).toBe(true);
        expect(pageReady).toBeGreaterThan(mainWorldSignal);
        expect(playerReady).toBeGreaterThan(pageReady);
        expect(buttonsAttached).toBeGreaterThan(playerReady);
        expect(buttonsReady).toBeGreaterThan(buttonsAttached);

        const popup = await openEmbeddedPopup(extensionPage);
        await expect(popup.locator("#mainControls")).toBeVisible();
        await popup.locator(".sbCloseButton").click();
        await expect(extensionPage.locator("#sponsorBlockPopupContainer")).toHaveCount(0);
    });

    test("opens submission notice on the real video player", async ({
        extensionPage,
        extensionServiceWorker,
        sendContentMessage,
    }) => {
        const videoIdResponse = await waitForBilibiliContentScript(extensionPage, sendContentMessage);
        expect(videoIdResponse.videoID).not.toBeNull();
        await openSubmissionNoticeWithImportedSegment(extensionPage, extensionServiceWorker, sendContentMessage);
        await assertSubmissionNoticeActionTypeSwitching(extensionPage);
        await closeSubmissionNotice(extensionPage);
    });
});
