import { expect, test } from "./fixtures/extension";
import { routeMockBilibiliVideoPage } from "./support/bilibiliPage";
import {
    assertSubmissionNoticeActionTypeSwitching,
    closeSubmissionNotice,
    openSubmissionNoticeWithImportedSegment,
    waitForBilibiliContentScript,
} from "./support/submissionNotice";

test("opens submission notice and switches action types", async ({
    extensionPage,
    extensionServiceWorker,
    sendContentMessage,
}) => {
    await routeMockBilibiliVideoPage(extensionPage);
    await extensionPage.goto("https://www.bilibili.com/video/BV1JfLg6qEtf/");
    await expect(extensionPage.locator("#bilibili-player video")).toBeVisible();

    await waitForBilibiliContentScript(extensionPage, sendContentMessage);
    await openSubmissionNoticeWithImportedSegment(extensionPage, extensionServiceWorker, sendContentMessage);
    await assertSubmissionNoticeActionTypeSwitching(extensionPage);
    await closeSubmissionNotice(extensionPage);
});
