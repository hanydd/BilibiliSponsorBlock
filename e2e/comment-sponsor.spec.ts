import { expect, test } from "./fixtures/extension";
import { defaultMockBvid, defaultMockCid, getMockVideoTime, pauseMockVideo, routeMockBilibiliVideoPage, setMockVideoTime } from "./support/bilibiliPage";
import { writeSyncStorage } from "./support/extensionStorage";
import { routeMockSponsorSegments } from "./support/sponsorBlockApi";
import { waitForBilibiliContentScript } from "./support/submissionNotice";

test("comment blocking coexists with video skipping, player controls and popup", async ({
    extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage,
}) => {
    await writeSyncStorage(extensionServiceWorker, {
        dynamicAndCommentSponsorBlocker: true,
        commentSponsorBlock: true,
        dynamicSponsorBlock: false,
        commentSponsorReplyBlock: false,
        dynamicSponsorSelections: [{ name: "dynamicSponsor_sponsor", option: 2 }],
        skipOnSeekToSegment: true,
        autoHideInfoButton: false,
    });
    await routeMockSponsorSegments(extensionContext, defaultMockBvid, [{
        segment: [5, 20], UUID: "comment-coexistence", category: "sponsor", actionType: "skip",
        cid: defaultMockCid, videoDuration: 120,
    }]);
    await routeMockBilibiliVideoPage(page, { currentTime: 0, paused: false });
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);
    await expect.poll(async () => (await sendContentMessage<{ sponsorTimes?: unknown[] }>({
        message: "isInfoFound", updating: false,
    })).sponsorTimes?.length).toBe(1);
    await page.waitForTimeout(6000);
    await page.evaluate(() => {
        const add = (tag: string, parent: Node, html = "") => {
            const host = document.createElement(tag);
            host.attachShadow({ mode: "open" }).innerHTML = html;
            parent.appendChild(host);
            return host;
        };
        const root = add("bili-comments", document.body, '<div id="feed"></div>');
        const thread = add("bili-comment-thread-renderer", root.shadowRoot.querySelector("#feed"));
        const comment = add("bili-comment-renderer", thread.shadowRoot, '<div id="content"></div>');
        add("bili-rich-text", comment.shadowRoot.querySelector("#content"), '<span>advertisement</span>');
        add("bili-comment-user-info", comment.shadowRoot, '<span id="user-level"></span>');
        add("bili-comment-action-buttons-renderer", comment.shadowRoot, '<button id="reply">reply</button>');
    });
    // Render the goods link in a separate task, after outer observers have run.
    await page.evaluate(() => {
        const root = document.querySelector("bili-comments").shadowRoot;
        const comment = root.querySelector("bili-comment-thread-renderer").shadowRoot.querySelector("bili-comment-renderer");
        comment.shadowRoot.querySelector("bili-rich-text").shadowRoot.innerHTML = '<a data-type="goods">product</a>';
    });
    await expect(page.locator("bili-comments #commentSponsorLabel")).toHaveCount(1);
    await expect(page.locator("bili-comments #content")).toBeHidden();

    await setMockVideoTime(page, 6, true);
    await expect(page.locator("[id^='sponsorSkipNoticeContainer']")).toHaveCount(1);
    await pauseMockVideo(page);
    expect(await getMockVideoTime(page)).toBeGreaterThanOrEqual(20);

    await page.locator("#startSegmentButton").click();
    await expect(page.locator("#cancelSegmentButton")).toBeVisible();
    await page.locator("#cancelSegmentButton").click();
    await expect(page.locator("#cancelSegmentButton")).toBeHidden();
    await page.locator("#infoButton").click();
    await expect(page.locator("#sponsorBlockPopupContainer")).toBeVisible();
    await expect(page.locator("bili-comments #commentSponsorLabel")).toHaveCount(1);
});
