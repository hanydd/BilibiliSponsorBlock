import { test } from "./fixtures/extension";
import {
    assertSubmissionNoticeActionTypeSwitching,
    closeSubmissionNotice,
    openSubmissionNoticeWithImportedSegment,
    waitForBilibiliContentScript,
} from "./support/submissionNotice";

const realPageSettleMs = Number(process.env.BSB_REAL_PAGE_SETTLE_MS ?? 10_000);

test("@real opens submission notice on the real Bilibili video page", async ({
    extensionPage,
    extensionServiceWorker,
    sendContentMessage,
}) => {
    test.setTimeout(realPageSettleMs + 120_000);

    await extensionPage.goto("https://www.bilibili.com/video/BV1JfLg6qEtf/", {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
    });

    console.log(`[e2e:real] page opened, waiting ${realPageSettleMs}ms before extension messages`);
    await extensionPage.waitForTimeout(realPageSettleMs);
    console.log(`[e2e:real] after settle url=${extensionPage.url()} title=${await extensionPage.title()}`);

    const securityBlocked = await extensionPage.getByText("错误号: 412").isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(securityBlocked, "Bilibili rejected this automated browser with security control error 412.");

    await waitForBilibiliContentScript(extensionPage, sendContentMessage);
    await openSubmissionNoticeWithImportedSegment(extensionPage, extensionServiceWorker, sendContentMessage);
    await assertSubmissionNoticeActionTypeSwitching(extensionPage);
    await closeSubmissionNotice(extensionPage);
});
