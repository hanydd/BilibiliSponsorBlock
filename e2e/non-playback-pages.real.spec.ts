import { expect, test } from "./fixtures/extension";
import { openRealBilibiliPage } from "./support/realBilibili";
import { writeSyncStorage } from "./support/extensionStorage";

const cases = [
    { name: "home", url: "https://www.bilibili.com/" },
    { name: "search", url: "https://search.bilibili.com/all?keyword=python" },
    { name: "space dynamics", url: "https://space.bilibili.com/21302388/dynamic" },
    { name: "dynamic feed logged out", url: "https://t.bilibili.com/" },
    { name: "opus video cards", url: "https://www.bilibili.com/opus/1129722427782201345" },
];

for (const item of cases) {
    test(`@real ${item.name}: hydration does not attach player controls to video cards`, async ({
        extensionPage: page, extensionContext, extensionServiceWorker, sendContentMessage,
    }, testInfo) => {
        testInfo.setTimeout(90_000);
        await writeSyncStorage(extensionServiceWorker, {
            fullVideoSegments: true,
            fullVideoLabelsOnThumbnailsMode: 1,
            dynamicAndCommentSponsorBlocker: true,
            dynamicSponsorBlock: true,
            dynamicSpaceSponsorBlocker: true,
            commentSponsorBlock: true,
            dynamicSponsorSelections: [{ name: "dynamicSponsor_suspicion_sponsor", option: 1 }],
            dynamicAndCommentSponsorRegexUserRules: [{
                id: "e2e-real-card", name: "Match real cards", pattern: ".+", enabled: true,
            }],
        });
        // Keep Bilibili's real DOM, scripts and media; supply deterministic labels
        // for IDs discovered by the extension on this page, without posting data.
        await extensionContext.route("https://www.bsbsb.top/api/videoLabels/**", async route => {
            const ids = await page.locator("[data-bsb-bvid]").evaluateAll(cards =>
                [...new Set(cards.map(card => card.getAttribute("data-bsb-bvid")))]);
            await route.fulfill({ contentType: "application/json", body: JSON.stringify(
                ids.map(videoID => ({ videoID, segments: [{ category: "sponsor" }] }))
            ) });
        });
        const spaceFeed = item.name === "space dynamics" ? page.waitForResponse(
            response => response.url().includes("/x/polymer/web-dynamic/v1/feed/space"),
            { timeout: 30000 }
        ).then(response => response.json()).catch(() => null) : null;
        await openRealBilibiliPage(page, testInfo, item.url);
        if (item.name === "space dynamics") {
            await page.waitForFunction(() => {
                const app = document.querySelector("#app") as Element & { __vue_app__?: unknown };
                return !!app?.__vue_app__ || !!document.querySelector(".bili-mini-mask");
            });
            const loginGate = await page.evaluate(() => {
                const app = document.querySelector("#app") as Element & { __vue_app__?: unknown };
                return !app?.__vue_app__ && document.body.innerText.includes("扫描二维码登录");
            });
            if (loginGate) {
                const response = await sendContentMessage<{ lifecycleSummary: Record<string, { count: number }> }>({ message: "getLogs" });
                expect(response.lifecycleSummary["pageReady/ready"]?.count ?? 0).toBe(0);
                await expect(page.locator("#dynamicSponsorLabel, #bsbPlayerButtonContainer, #previewbar")).toHaveCount(0);
            }
            test.skip(loginGate, "Bilibili requires login before mounting this space page.");
        }
        await expect.poll(async () => {
            const response = await sendContentMessage<{
                logs: { lifecycle: Array<{ stage: string }> };
                lifecycleSummary: Record<string, { count: number }>;
            }>({ message: "getLogs" });
            return response.lifecycleSummary["pageReady/ready"]?.count ?? 0;
        }).toBeGreaterThan(0);
        await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(0);
        await expect(page.locator("#previewbar")).toHaveCount(0);
        if (item.name === "home" || item.name === "search") {
            await expect(page.locator(".sponsorThumbnailLabelVisible").first()).toBeVisible();
        }
        if (item.name === "dynamic feed logged out" || item.name === "space dynamics") {
            if (spaceFeed) {
                const feed = await spaceFeed;
                test.skip(feed?.code === 0 && Array.isArray(feed.data?.items) && feed.data.items.length === 0,
                    "Bilibili returned an empty space feed; hydration and no-player checks passed, but there are no cards to label.");
            }
            await expect(page.locator(".bili-dyn-list__items #dynamicSponsorLabel").first()).toBeVisible();
        }
        const card = page.locator(item.name === "home"
            ? '.bili-video-card a[href*="/video/"]' : 'a[href*="/video/"]:not(.carousel-item)').filter({ visible: true }).first();
        if (await card.count()) {
            await card.hover({ timeout: 10000 });
            await page.waitForTimeout(1500);
            await expect(page.locator(".v-recommend-inline-player #bsbPlayerButtonContainer")).toHaveCount(0);
            await expect(page.locator(".v-recommend-inline-player #previewbar")).toHaveCount(0);
        }
        const response = await sendContentMessage<{
            lifecycleSummary: Record<string, { count: number }>;
            logs: { lifecycle: Array<{ stage: string; details: Record<string, unknown> }> };
        }>({ message: "getLogs" });
        expect(response.lifecycleSummary["playerUI/ready"]?.count ?? 0).toBe(0);
        expect(response.logs.lifecycle.some(entry => entry.stage === "video/wait" &&
            entry.details.action === "refreshAttachments")).toBe(false);
    });
}
