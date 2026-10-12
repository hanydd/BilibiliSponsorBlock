import { expect, test } from "./fixtures/extension";
import { writeSyncStorage } from "./support/extensionStorage";
import { routeMockVideoLabels } from "./support/sponsorBlockApi";
import { findLifecycleIndex, getLifecycleLogs } from "./support/lifecycle";

const bvid = "BV1hUvpewEYD";
const card = (generation: string) => `<div class="bili-dyn-list__item bili-dyn-item" data-generation="${generation}">
    <div class="bili-dyn-item__avatar"></div>
    <div class="bili-dyn-title__text">Author</div>
    <div class="bili-dyn-content"><div class="bili-dyn-card-goods">Product</div>
        <a href="https://www.bilibili.com/video/${bvid}"><div><picture><img
            src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" /></picture></div></a>
    </div>
    <div class="bili-dyn-item__action">Forward</div><div class="bili-dyn-item__action">Comment</div>
    <div class="bili-dyn-item__action">Like</div>
</div>`;

test.beforeEach(async ({ extensionServiceWorker }) => {
    await writeSyncStorage(extensionServiceWorker, {
        dynamicAndCommentSponsorBlocker: true,
        dynamicSponsorBlock: true,
        dynamicSpaceSponsorBlocker: true,
        commentSponsorBlock: true,
        commentSponsorReplyBlock: false,
        whitelistedChannels: [],
        dynamicSponsorSelections: [{ name: "dynamicSponsor_sponsor", option: 1 }],
        fullVideoSegments: true,
        fullVideoLabelsOnThumbnailsMode: 1,
    });
});

for (const url of ["https://t.bilibili.com/", "https://space.bilibili.com/21302388/dynamic"]) {
    test(`dynamic labels wait for hydration and survive list replacement without a player: ${url}`, async ({
        extensionPage: page, extensionContext, sendContentMessage,
    }) => {
        await routeMockVideoLabels(extensionContext, [{ videoID: bvid, category: "sponsor" }]);
        await page.route(url, route => route.fulfill({ contentType: "text/html", body: `<!DOCTYPE html>
            <html><body><div id="app"><div class="bili-dyn-list"><div class="bili-dyn-list__items">${card("ssr")}
            </div></div></div></body></html>` }));
        await page.goto(url);
        await page.locator('[data-generation="ssr"]').evaluate(item => {
            item["__vue__"] = { author: { mid: 123, type: "AUTHOR_TYPE_NORMAL" } };
        });
        await getLifecycleLogs(sendContentMessage);
        await page.waitForTimeout(1200);
        await expect(page.locator("#dynamicSponsorLabel, .sponsorThumbnailLabel")).toHaveCount(0);
        await expect(page.locator(".bili-dyn-item__avatar")).not.toHaveAttribute("bilisponsor-userid");
        expect(findLifecycleIndex(await getLifecycleLogs(sendContentMessage), "pageReady/ready")).toBe(-1);

        // Model the framework replacing SSR children before publishing its mount.
        await page.locator("#app").evaluate((app: HTMLElement, html) => {
            app.innerHTML = `<div class="bili-dyn-list"><div class="bili-dyn-list__items">${html}</div></div>`;
            app.querySelector(".bili-dyn-item")["__vue__"] = { author: { mid: 123, type: "AUTHOR_TYPE_NORMAL" } };
            app["__vue_app__"] = {};
        }, card("hydrated"));
        await expect(page.locator('[data-generation="hydrated"] #dynamicSponsorLabel')).toHaveCount(1);
        await expect(page.locator(".bili-dyn-item__avatar")).toHaveAttribute("bilisponsor-userid", "123");
        await expect(page.locator(".sponsorThumbnailLabelVisible")).toHaveCount(1);
        await expect(page.locator('[data-generation="ssr"]')).toHaveCount(0);

        await page.locator(".bili-dyn-list").evaluate((list, html) => {
            const next = document.createElement("div");
            next.className = "bili-dyn-list";
            next.innerHTML = `<div class="bili-dyn-list__items">${html}</div>`;
            next.querySelector(".bili-dyn-item")["__vue__"] = { author: { mid: 456, type: "AUTHOR_TYPE_NORMAL" } };
            list.replaceWith(next);
        }, card("replaced"));
        await expect(page.locator('[data-generation="replaced"] #dynamicSponsorLabel')).toHaveCount(1);
        await expect(page.locator(".bili-dyn-item__avatar")).toHaveAttribute("bilisponsor-userid", "456");
        await expect(page.locator(".sponsorThumbnailLabelVisible")).toHaveCount(1);

        await page.locator(".bili-dyn-list__items").evaluate((list, html) => list.insertAdjacentHTML("beforeend", html), card("added"));
        await expect(page.locator("#dynamicSponsorLabel")).toHaveCount(2);
        await expect(page.locator(".sponsorThumbnailLabelVisible")).toHaveCount(2);
        await expect(page.locator("video, #bsbPlayerButtonContainer, #previewbar")).toHaveCount(0);
        const logs = await getLifecycleLogs(sendContentMessage);
        expect(findLifecycleIndex(logs, "pageReady/ready")).toBeGreaterThanOrEqual(0);
        expect(findLifecycleIndex(logs, "playerUI/ready")).toBe(-1);
        expect(logs.some(entry => entry.stage === "video/wait" &&
            entry.details.action === "refreshAttachments")).toBe(false);
    });
}

test("opus comments wait for page hydration and keep observing nested components without a player", async ({
    extensionPage: page, extensionServiceWorker, sendContentMessage,
}) => {
    await writeSyncStorage(extensionServiceWorker, {
        dynamicSponsorSelections: [{ name: "dynamicSponsor_sponsor", option: 2 }],
    });
    const url = "https://www.bilibili.com/opus/1129722427782201345";
    await page.route(url, route => route.fulfill({ contentType: "text/html", body: `<!DOCTYPE html>
        <html><body><div id="app"></div><script>
        const add = (tag, parent, html = '') => {
            const host = document.createElement(tag);
            host.attachShadow({ mode: 'open' }).innerHTML = html;
            parent.appendChild(host); return host;
        };
        window.addComment = (goods) => {
            const root = add('bili-comments', document.querySelector('#app'));
            const thread = add('bili-comment-thread-renderer', root.shadowRoot);
            const comment = add('bili-comment-renderer', thread.shadowRoot, '<div id="content"></div>');
            add('bili-rich-text', comment.shadowRoot.querySelector('#content'), goods ? '<a data-type="goods">Product</a>' : '<span>Comment</span>');
            add('bili-comment-user-info', comment.shadowRoot, '<span id="user-level"></span>');
            add('bili-comment-action-buttons-renderer', comment.shadowRoot, '<button id="reply">Reply</button>');
        };
        window.addComment(true);
        </script></body></html>` }));
    await page.goto(url);
    await getLifecycleLogs(sendContentMessage);
    await page.waitForTimeout(1200);
    await expect(page.locator("bili-comments #commentSponsorLabel")).toHaveCount(0);
    await expect(page.locator("bili-comments #content")).toBeVisible();
    await page.evaluate(() => { document.querySelector("#app")["__vue_app__"] = {}; });
    await expect(page.locator("bili-comments #commentSponsorLabel")).toHaveCount(1);
    await expect(page.locator("bili-comments #content")).toBeHidden();

    await page.evaluate(() => window["addComment"](false));
    const late = page.locator("bili-comments").last();
    await expect(late.locator("#content")).toBeVisible();
    await late.locator("bili-rich-text").evaluate(host => {
        host.shadowRoot.innerHTML = '<a data-type="goods">Late product</a>';
    });
    await expect(late.locator("#commentSponsorLabel")).toHaveCount(1);
    await expect(late.locator("#content")).toBeHidden();
    await late.locator("#showDynamicSponsor").click();
    await expect(late.locator("#content")).toBeVisible();
    await expect(page.locator("video, #bsbPlayerButtonContainer, #previewbar")).toHaveCount(0);
    expect(findLifecycleIndex(await getLifecycleLogs(sendContentMessage), "playerUI/ready")).toBe(-1);
});
