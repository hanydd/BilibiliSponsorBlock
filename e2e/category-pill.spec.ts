import { createHash } from "crypto";
import { test, expect } from "./fixtures/extension";
import { routeMockBilibiliVideoPage, defaultMockCid } from "./support/bilibiliPage";
import { writeSyncStorage } from "./support/extensionStorage";
import type { BrowserContext, Page } from "@playwright/test";

const plain = "BV1JfLg6qEtf";
const sponsor = "BV1cNYP6wEiB";
const selfpromo = "BV1inJc6jERA";
const url = (id: string) => `https://www.bilibili.com/video/${id}/`;
const labels = [
    { videoID: plain, segments: [] },
    ...[[sponsor, "sponsor"], [selfpromo, "selfpromo"]].map(([videoID, category]) => ({
        videoID, segments: [{ UUID: videoID, cid: defaultMockCid, segment: [0, 0], category,
            actionType: "full", videoDuration: 120 }],
    })),
];
const visiblePill = (page: Page) => page.locator("h1 .sponsorBlockCategoryPill:visible");
async function expectLabel(page: Page, category?: string) {
    await expect(visiblePill(page)).toHaveCount(category ? 1 : 0);
    if (category) {
        await expect(visiblePill(page)).toHaveAttribute("style", new RegExp(`--sb-category-preview-${category}`));
        await expect(page.locator("#categoryPill")).toHaveCount(1);
    }
}
async function api(context: BrowserContext) {
    await context.route("https://www.bsbsb.top/api/skipSegments/**", route => route.fulfill({
        contentType: "application/json", body: JSON.stringify(labels),
    }));
}
async function open(page: Page, id: string, hydration = 0) {
    await routeMockBilibiliVideoPage(page, { bvid: id, title: id, vueHydrationDelayMs: hydration });
    await page.goto(url(id));
}
async function installRouter(page: Page) {
    await page.evaluate(() => {
        const w = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        w.originalVideo = document.querySelector("video");
        w.changePillRoute = (id: string, delay = 0, replace = false, push = true) => {
            w.__INITIAL_STATE__.bvid = id;
            w.__INITIAL_STATE__.cid = "123456";
            w.player.getManifest = () => ({ aid: 1, bvid: id, cid: "123456", p: 1 });
            if (push) history.pushState({}, "", `/video/${id}/`);
            const render = () => {
                if (replace) {
                    const h1 = document.createElement("h1");
                    h1.textContent = id;
                    document.querySelector("h1").replaceWith(h1);
                } else document.querySelector("h1").textContent = id;
            };
            if (delay) setTimeout(render, delay); else render();
        };
        window.addEventListener("popstate", () => w.changePillRoute(location.pathname.split("/")[2], 0, false, false));
    });
    // Consume the once-only mouseover fallback before any navigation.
    await page.mouse.move(300, 200);
    await page.waitForTimeout(300);
}
async function route(page: Page, id: string, delay = 0, replace = false) {
    await page.evaluate(({ id, delay, replace }) => {
        (window as any).changePillRoute(id, delay, replace); // eslint-disable-line @typescript-eslint/no-explicit-any
    }, { id, delay, replace });
}

for (const mode of ["legacy", "rules"] as const) {
    test(`${mode}: SPA transitions, title rewrites/replacement, back and forward`, async ({ extensionPage: page, extensionContext, extensionServiceWorker }) => {
        await writeSyncStorage(extensionServiceWorker, { skipEngineMode: mode });
        await api(extensionContext);
        await open(page, plain, 1000);
        await expect(page.locator("#categoryPill")).toHaveCount(0);
        await expect(page.locator("#categoryPill")).toHaveCount(1);
        await installRouter(page);
        await route(page, sponsor, 700);
        await expectLabel(page, "sponsor");
        await expect(page.locator("h1")).toContainText(sponsor);
        await expectLabel(page, "sponsor");
        await route(page, selfpromo, 0, true);
        await expectLabel(page, "selfpromo");
        await route(page, plain);
        await expectLabel(page);
        await page.goBack();
        await expectLabel(page, "selfpromo");
        await page.goBack();
        await expectLabel(page, "sponsor");
        await page.goForward();
        await expectLabel(page, "selfpromo");
        expect(await page.evaluate(() => (window as any).originalVideo === document.querySelector("video"))).toBe(true); // eslint-disable-line @typescript-eslint/no-explicit-any
        await page.evaluate(() => {
            const video = document.querySelector("video");
            video.replaceWith(video.cloneNode(true));
        });
        await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(1);
        await expectLabel(page, "selfpromo");
    });

    test(`${mode}: full document navigation and reload clear or restore labels`, async ({ extensionPage: page, extensionContext, extensionServiceWorker }) => {
        await writeSyncStorage(extensionServiceWorker, { skipEngineMode: mode });
        await api(extensionContext);
        for (const [id, category] of [[sponsor, "sponsor"], [selfpromo, "selfpromo"], [plain, undefined], [sponsor, "sponsor"]]) {
            await open(page, id);
            await expect(page.locator("#categoryPill")).toHaveCount(1);
            await expectLabel(page, category);
            await page.reload();
            await expect(page.locator("#categoryPill")).toHaveCount(1);
            await expectLabel(page, category);
        }
    });

    test(`${mode}: multipart SPA navigation clears a label belonging to another CID`, async ({ extensionPage: page, extensionContext, extensionServiceWorker }) => {
        await writeSyncStorage(extensionServiceWorker, { skipEngineMode: mode });
        await api(extensionContext);
        await open(page, sponsor);
        await expectLabel(page, "sponsor");
        await installRouter(page);
        await page.evaluate(() => {
            const w = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any
            w.__INITIAL_STATE__.cid = "654321";
            w.player.getManifest = () => ({ aid: 1, bvid: w.__INITIAL_STATE__.bvid, cid: "654321", p: 2 });
            history.pushState({}, "", "?p=2");
        });
        await expectLabel(page);
        await page.goBack();
        await expectLabel(page, "sponsor");
    });

    test(`${mode}: rapid SPA changes ignore an old delayed full-video response`, async ({ extensionPage: page, extensionContext, extensionServiceWorker }) => {
        await writeSyncStorage(extensionServiceWorker, { skipEngineMode: mode });
        await api(extensionContext);
        const prefix = createHash("sha256").update(sponsor).digest("hex").slice(0, 4);
        let requested = false;
        let release: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        await extensionContext.route(`https://www.bsbsb.top/api/skipSegments/${prefix}**`, async r => {
            requested = true;
            await gate;
            await r.fulfill({ contentType: "application/json", body: JSON.stringify(labels) });
        });
        await open(page, plain);
        await expect(page.locator("#categoryPill")).toHaveCount(1);
        await installRouter(page);
        await route(page, sponsor);
        await expect.poll(() => requested).toBe(true);
        await route(page, selfpromo);
        await expectLabel(page, "selfpromo");
        release();
        await page.waitForTimeout(500);
        await expectLabel(page, "selfpromo");
    });
}
