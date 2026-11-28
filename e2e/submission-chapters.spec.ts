import { expect, test } from "./fixtures/extension";
import { defaultMockBvid, defaultMockCid, routeMockBilibiliVideoPage, setMockVideoTime } from "./support/bilibiliPage";
import { readLocalStorage, writeSyncStorage } from "./support/extensionStorage";
import { closeSubmissionNotice, waitForBilibiliContentScript } from "./support/submissionNotice";

test("creates an editable chapter draft without recording timestamps first", async ({
    extensionPage: page, extensionServiceWorker, sendContentMessage,
}) => {
    await writeSyncStorage(extensionServiceWorker, { autoHideInfoButton: false, showShortcutPopover: false });
    await routeMockBilibiliVideoPage(page, {
        chapters: [
            { from: 20, to: 30, content: "Sponsor chapter" },
            { from: 0, to: 20, content: "Intro" },
            { from: 40, to: 40, content: "Point marker" },
        ],
    });
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);

    const upload = page.locator("#submitButton");
    const notice = page.locator("#submissionNoticeContainer");
    const picker = notice.locator("#sponsorChapterPicker");
    const submit = notice.locator("#sponsorSkipNoticeSecondRowSubmissionNotice button").last();
    await upload.click();
    await expect(submit).toBeDisabled();
    await expect(picker.locator("option")).toHaveCount(3);
    await picker.selectOption({ label: "0:20 – 0:30 Sponsor chapter" });
    await expect(notice.locator("#sponsorTimesContainerSubmissionNotice0")).toContainText(/0:20.*0:30/);
    await expect(submit).toBeEnabled();
    await notice.locator("#sponsorTimeCategoriesSubmissionNotice0").selectOption("sponsor");
    await picker.selectOption({ label: "0:20 – 0:30 Sponsor chapter" });
    await closeSubmissionNotice(page);

    await page.locator("#startSegmentButton").click();
    await upload.click();
    await picker.selectOption({ label: "0:00 – 0:20 Intro" });
    await expect(notice.locator("#sponsorTimesContainerSubmissionNotice1")).toContainText(/0:00.*0:20/);
    await expect(notice.locator("#sponsorTimesContainerSubmissionNotice2")).toContainText("0:15");
    await closeSubmissionNotice(page);
    await setMockVideoTime(page, 18);
    await page.locator("#startSegmentButton").click();

    await expect.poll(async () => {
        const drafts = await readLocalStorage<Record<string, Array<{ cid: string; segment: number[] }>>>(
            extensionServiceWorker, "unsubmittedSegments"
        );
        return drafts?.[`${defaultMockBvid}+${defaultMockCid}`]?.map(({ cid, segment }) => ({ cid, segment }));
    }).toEqual([
        { cid: defaultMockCid, segment: [20, 30] },
        { cid: defaultMockCid, segment: [0, 20] },
        { cid: defaultMockCid, segment: [15, 18] },
    ]);
});
