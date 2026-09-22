import { expect, test } from "./fixtures/extension";
import { writeSyncStorage } from "./support/extensionStorage";
import { openRealBilibiliPage } from "./support/realBilibili";

// Public videos with goods links in top-level comments. Their comments can change.
for (const bvid of ["BV1EZ7p6CEKh", "BV1bpeJ6ZEYQ", "BV1pYEu67E2r"]) {
    test(`@real hides goods comments loaded after startup on ${bvid}`, async ({
        extensionPage: page,
        extensionServiceWorker,
    }, testInfo) => {
        testInfo.setTimeout(120_000);
        await writeSyncStorage(extensionServiceWorker, {
            dynamicAndCommentSponsorBlocker: true,
            dynamicSponsorBlock: false,
            commentSponsorBlock: true,
            commentSponsorReplyBlock: false,
            whitelistedChannels: [],
            dynamicSponsorSelections: [{ name: "dynamicSponsor_sponsor", option: 2 }],
        });
        await openRealBilibiliPage(page, testInfo, `https://www.bilibili.com/video/${bvid}/`);
        await expect(page.locator("#startSegmentButton")).toBeAttached();
        // Let the single compensation finish before triggering lazy comment rendering.
        await page.waitForTimeout(6000);
        await page.evaluate(() => window.scrollBy(0, 900));

        const readComments = () => page.evaluate(() => {
            const root = document.querySelector("bili-comments")?.shadowRoot;
            return [...root?.querySelectorAll("bili-comment-thread-renderer") ?? []].map((thread) => {
                const comment = thread.shadowRoot?.querySelector("bili-comment-renderer")?.shadowRoot;
                const content = comment?.querySelector<HTMLElement>("#content");
                return {
                    ready: Boolean(content),
                    goods: Boolean(comment?.querySelector("bili-rich-text")?.shadowRoot?.querySelector('a[data-type="goods"]')),
                    hidden: content?.style.display === "none",
                    labeled: Boolean(comment?.querySelector("bili-comment-user-info")?.shadowRoot?.querySelector("#commentSponsorLabel")),
                };
            });
        });
        await expect.poll(async () => (await readComments()).some(c => c.goods), {
            timeout: 20_000,
            message: "The public page must supply an actual goods comment to validate blocking",
        }).toBe(true);
        await expect.poll(async () => {
            const comments = await readComments();
            return comments.filter(c => c.goods).every(c => c.hidden && c.labeled);
        }).toBe(true);
        expect((await readComments()).filter(c => c.ready && !c.goods).every(c => !c.hidden)).toBe(true);

        const ad = page.locator("bili-comment-thread-renderer").filter({
            has: page.locator("#commentSponsorLabel"),
        }).first();
        const content = ad.locator("bili-comment-renderer #content").first();
        const toggle = ad.locator("#showDynamicSponsor").first();
        await expect(toggle).toHaveCount(1);
        await toggle.click();
        await expect(content).toBeVisible();
        await toggle.click();
        await expect(content).toBeHidden();
        await testInfo.attach("comment-blocking", {
            body: await page.screenshot(),
            contentType: "image/png",
        });
    });
}
