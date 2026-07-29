import type { Page, Worker } from "@playwright/test";
import { expect } from "../fixtures/extension";

type SendContentMessage = <TResponse = unknown>(message: unknown) => Promise<TResponse>;
type VideoIdResponse = {
    videoID: string | null;
};

export async function waitForBilibiliContentScript(
    page: Page,
    sendContentMessage: SendContentMessage
): Promise<VideoIdResponse> {
    await page.locator("#bilibili-player video").first().waitFor({ state: "attached", timeout: 60_000 });
    return await sendContentMessage<VideoIdResponse>({ message: "getVideoID" });
}

export async function openSubmissionNoticeWithImportedSegment(
    page: Page,
    extensionServiceWorker: Worker,
    sendContentMessage: SendContentMessage
): Promise<void> {
    const sponsorCategoryName = await extensionServiceWorker.evaluate(() => {
        const chromeApi = (globalThis as { chrome: typeof chrome }).chrome;
        return chromeApi.i18n.getMessage("category_sponsor_short") || chromeApi.i18n.getMessage("category_sponsor");
    });

    const importResponse = await sendContentMessage<{ importedSegments: unknown[] }>({
        message: "importSegments",
        data: `0:10 - 0:20 ${sponsorCategoryName}`,
    });
    expect(importResponse.importedSegments).toHaveLength(1);

    const notice = page.locator("#submissionNoticeContainer");
    await expect(notice).toHaveCount(1);
    await expect(page.locator("#sponsorTimeEditContainerSubmissionNotice0")).toBeVisible();
    await expect(page.locator("#sponsorTimeCategoriesSubmissionNotice0")).toHaveValue("sponsor");
}

export async function assertSubmissionNoticeActionTypeSwitching(page: Page): Promise<void> {
    const timeDisplay = page.locator("#sponsorTimesContainerSubmissionNotice0");
    await expect(timeDisplay).toBeVisible();

    await page.locator('label:has(input[type="radio"][value="full"])').click();
    await expect(timeDisplay).toBeHidden();

    await page.locator('label:has(input[type="radio"][value="skip"])').click();
    await expect(timeDisplay).toBeVisible();
}

export async function closeSubmissionNotice(page: Page): Promise<void> {
    const notice = page.locator("#submissionNoticeContainer");
    await notice.locator(".sponsorSkipNoticeCloseButton").click();
    await expect(notice).toHaveCount(0);
}
