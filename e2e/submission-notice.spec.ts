import { expect, test } from "./fixtures/extension";
import { defaultMockBvid, defaultMockCid, routeMockBilibiliVideoPage } from "./support/bilibiliPage";
import { writeSyncStorage } from "./support/extensionStorage";
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

test('submission category visibility follows account canSubmit permissions and the display toggle', async ({ extensionPage: page, extensionServiceWorker, sendContentMessage }) => {
    await waitForBilibiliContentScript(page, sendContentMessage);
    await writeSyncStorage(extensionServiceWorker, { showCategoryWithoutPermission: false,
        permissions: { sponsor: { canSubmit: true }, selfpromo: { canSubmit: false }, intro: false } });
    await openSubmissionNoticeWithImportedSegment(page, extensionServiceWorker, sendContentMessage);
    await expect(page.locator('#sponsorTimeCategoriesSubmissionNotice0 option[value="selfpromo"]')).toHaveCount(0);
    await expect(page.locator('#sponsorTimeCategoriesSubmissionNotice0 option[value="intro"]')).toHaveCount(0);
    await expect(page.locator('#sponsorTimeCategoriesSubmissionNotice0 option[value="sponsor"]')).toHaveCount(1);
    await expect(page.locator('#sponsorTimeCategoriesSubmissionNotice0 option[value="padding"]')).toHaveCount(1);
    await writeSyncStorage(extensionServiceWorker, { showCategoryWithoutPermission: true });
    await expect(page.locator('#sponsorTimeCategoriesSubmissionNotice0 option[value="selfpromo"]')).toHaveCount(1);
    await expect(page.locator('#sponsorTimeCategoriesSubmissionNotice0 option[value="intro"]')).toHaveCount(1);
    await writeSyncStorage(extensionServiceWorker, { showCategoryWithoutPermission: false });
    await expect(page.locator('#sponsorTimeCategoriesSubmissionNotice0 option[value="selfpromo"]')).toHaveCount(0);
});
