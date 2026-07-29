import { expect, test } from "./fixtures/extension";
import {
    defaultMockBvid,
    defaultMockCid,
    routeMockBilibiliVideoPage,
    setMockVideoTime,
} from "./support/bilibiliPage";
import { readLocalStorage, writeSyncStorage } from "./support/extensionStorage";
import { closeSubmissionNotice, waitForBilibiliContentScript } from "./support/submissionNotice";

const mockVideoId = `${defaultMockBvid}+${defaultMockCid}`;

test.beforeEach(async ({ extensionPage, extensionServiceWorker, sendContentMessage }) => {
    await writeSyncStorage(extensionServiceWorker, { autoHideInfoButton: false });
    await routeMockBilibiliVideoPage(extensionPage);
    await extensionPage.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(extensionPage, sendContentMessage);
    await expect(extensionPage.locator("#startSegmentButton")).toBeVisible();
});

test("records a segment from player controls and opens the submission editor", async ({
    extensionPage,
    extensionServiceWorker,
}) => {
    await expect(extensionPage.locator("#infoButton")).toBeVisible();
    await expect(extensionPage.locator("#submitButton")).toBeHidden();
    await expect(extensionPage.locator("#cancelSegmentButton")).toBeHidden();

    await extensionPage.locator("#startSegmentButton").click();
    await expect(extensionPage.locator("#cancelSegmentButton")).toBeVisible();
    await expect(extensionPage.locator("#submitButton")).toBeVisible();

    await setMockVideoTime(extensionPage, 25);
    await extensionPage.locator("#startSegmentButton").click();
    await expect(extensionPage.locator("#cancelSegmentButton")).toBeHidden();
    await expect(extensionPage.locator("#deleteButton")).toBeVisible();

    await expect
        .poll(async () => {
            const segments = await readLocalStorage<Record<string, Array<{ segment: number[] }>>>(
                extensionServiceWorker,
                "unsubmittedSegments"
            );
            return segments?.[mockVideoId]?.[0]?.segment;
        })
        .toEqual([15, 25]);

    await extensionPage.locator("#submitButton").click();
    await expect(extensionPage.locator("#submissionNoticeContainer")).toHaveCount(1);
    await closeSubmissionNotice(extensionPage);
});

test("cancels an unfinished segment from player controls", async ({ extensionPage, extensionServiceWorker }) => {
    await extensionPage.locator("#startSegmentButton").click();
    await expect(extensionPage.locator("#cancelSegmentButton")).toBeVisible();

    await extensionPage.locator("#cancelSegmentButton").click();
    await expect(extensionPage.locator("#cancelSegmentButton")).toBeHidden();
    await expect(extensionPage.locator("#submitButton")).toBeHidden();

    await expect
        .poll(() =>
            readLocalStorage<Record<string, unknown[]>>(extensionServiceWorker, "unsubmittedSegments")
        )
        .toEqual({});
});

test("records and edits a segment with the default keyboard shortcuts", async ({ extensionPage }) => {
    await extensionPage.keyboard.press(";");
    await expect(extensionPage.locator("#cancelSegmentButton")).toBeVisible();

    await setMockVideoTime(extensionPage, 22);
    await extensionPage.keyboard.press(";");
    await expect(extensionPage.locator("#cancelSegmentButton")).toBeHidden();
    await expect(extensionPage.locator("#submitButton")).toBeVisible();

    await extensionPage.keyboard.press("'");
    await expect(extensionPage.locator("#submissionNoticeContainer")).toHaveCount(1);
    await closeSubmissionNotice(extensionPage);
});
