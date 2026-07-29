import { expect, test } from "./fixtures/extension";
import { defaultMockBvid, defaultMockCid, routeMockBilibiliVideoPage } from "./support/bilibiliPage";
import {
    assertSubmissionNoticeActionTypeSwitching,
    closeSubmissionNotice,
    openSubmissionNoticeWithImportedSegment,
    waitForBilibiliContentScript,
} from "./support/submissionNotice";

test.beforeEach(async ({ extensionPage }) => {
    await routeMockBilibiliVideoPage(extensionPage);
    await extensionPage.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await expect(extensionPage.locator("#bilibili-player video")).toBeVisible();
});

test("injects the content script and reports the mocked video ID", async ({ extensionPage, sendContentMessage }) => {
    const response = await waitForBilibiliContentScript(extensionPage, sendContentMessage);

    expect(response.videoID).toBe(`${defaultMockBvid}+${defaultMockCid}`);
});

test("opens submission notice and switches action types", async ({
    extensionPage,
    extensionServiceWorker,
    sendContentMessage,
}) => {
    await waitForBilibiliContentScript(extensionPage, sendContentMessage);
    await openSubmissionNoticeWithImportedSegment(extensionPage, extensionServiceWorker, sendContentMessage);
    await assertSubmissionNoticeActionTypeSwitching(extensionPage);
    await closeSubmissionNotice(extensionPage);
});
