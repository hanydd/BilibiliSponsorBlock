import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/extension";
import { writeSyncStorage } from "./support/extensionStorage";
import { openRealBilibiliPage } from "./support/realBilibili";
import { routeMockSponsorSegments } from "./support/sponsorBlockApi";
import { waitForBilibiliContentScript } from "./support/submissionNotice";

const cases = [
    { name: "ordinary", url: "https://www.bilibili.com/video/BV1JfLg6qEtf/" },
    { name: "membership trial", url: "https://www.bilibili.com/bangumi/play/ep1231561", trial: true },
    { name: "charging 1953", url: "https://www.bilibili.com/video/BV1mVvYBxExC/", trial: true },
    { name: "charging 1963", url: "https://www.bilibili.com/video/BV1QcFkzQE2k/", trial: true },
    { name: "charging 1978", url: "https://www.bilibili.com/video/BV18WciziEFN/", trial: true },
    { name: "issue 326", url: "https://www.bilibili.com/video/BV1nXeA6PE63/", issue326: true },
];

async function readNativeAxis(page: Page) {
    return page.evaluate(() => {
        const video = document.querySelector<HTMLVideoElement>("#bilibili-player video:not(.bpx-player-seamless-replacement)");
        const player = video.closest(".bpx-player-container");
        const played = player.querySelector<HTMLElement>(".bpx-player-progress-schedule-current");
        const scale = /scaleX\(([^)]+)\)/.exec(played?.style.transform ?? "");
        const label = player.querySelector(".bpx-player-ctrl-time-duration")?.textContent?.trim() ?? "";
        const nativeRatio = scale ? Number(scale[1]) : 0;
        const point = player.querySelector<HTMLElement>('#previewbar [sponsorblock-category="poi_highlight"]');
        return {
            mediaDuration: video.duration, currentTime: video.currentTime, seeking: video.seeking,
            nativeLabel: label, labelSeconds: label.split(":").reduce((s, v) => s * 60 + Number(v), 0),
            nativeRatio, axisFromPlayhead: nativeRatio > 0 ? video.currentTime / nativeRatio : 0,
            pointPercent: point ? parseFloat(point.style.left) : null,
            pointPixel: point?.getBoundingClientRect().left,
            playedPixel: played?.getBoundingClientRect().right,
            apiDuration: (window as unknown as { __INITIAL_STATE__?: { videoData?: { duration?: number } } })
                .__INITIAL_STATE__?.videoData?.duration,
        };
    });
}

for (const item of cases) {
    test(`@real native axis ${item.name}: marks align with the native playhead and hover time`, async ({
        extensionPage: page, extensionContext, extensionServiceWorker, sendContentMessage,
    }, testInfo) => {
        testInfo.setTimeout(120_000);
        await writeSyncStorage(extensionServiceWorker, {
            autoHideInfoButton: false, showTimeWithSkips: true,
            categorySelections: [{ name: "sponsor", option: 1 }, { name: "poi_highlight", option: 1 }],
        });
        await openRealBilibiliPage(page, testInfo, item.url);
        const identity = await waitForBilibiliContentScript(page, sendContentMessage);
        await expect(page.locator("#previewbar")).toHaveCount(1);
        await page.locator("#bilibili-player video").first().evaluate((video: HTMLVideoElement) => {
            video.pause(); video.currentTime = 30;
        });
        await expect.poll(async () => {
            const state = await readNativeAxis(page);
            return !state.seeking && state.currentTime === 30 && state.nativeRatio > 0 &&
                Math.abs(state.axisFromPlayhead - state.labelSeconds) < 1.1;
        }).toBe(true);
        const before = await readNativeAxis(page);
        if (item.trial) expect(before.axisFromPlayhead).toBeGreaterThan(before.mediaDuration * 3);
        if (item.issue326) {
            expect(before.apiDuration - before.mediaDuration).toBeGreaterThan(8);
            expect(Math.abs(before.axisFromPlayhead - before.mediaDuration)).toBeLessThan(0.01);
        }
        const [bvid, cid] = identity.videoID.split("+");
        const ranges: [number, number][] = [[25, 35], [30, 30], [before.axisFromPlayhead - 15, before.axisFromPlayhead - 5]];
        await routeMockSponsorSegments(extensionContext, bvid, ranges.map((segment, i) => ({
            segment, cid, UUID: String(i + 1).repeat(64), videoDuration: before.mediaDuration,
            category: i === 1 ? "poi_highlight" : "sponsor", actionType: i === 1 ? "poi" : "skip",
        })));
        await sendContentMessage({ message: "refreshSegments" });
        await expect(page.locator("#previewbar > li")).toHaveCount(3);
        const player = page.locator("#bilibili-player .bpx-player-container");
        await player.hover();
        await page.locator("#bilibili-player .bpx-player-control-bottom-right").hover();
        await expect.poll(async () => {
            const state = await readNativeAxis(page);
            return Math.abs(state.pointPercent / 100 - state.nativeRatio);
        }).toBeLessThan(0.00001);
        const aligned = await readNativeAxis(page);
        expect(Math.abs(aligned.pointPixel - aligned.playedPixel)).toBeLessThan(1);

        const schedule = page.locator("#bilibili-player .bpx-player-progress .bpx-player-progress-schedule");
        const bounds = await schedule.boundingBox();
        // Our marks are children of the native progress host and overlay its
        // inner schedule. Hover the shared host, as a real pointer would do.
        const progress = page.locator("#bilibili-player .bpx-player-progress");
        const progressBounds = await progress.boundingBox();
        await progress.hover({ timeout: 10000, position: {
            x: bounds.x - progressBounds.x + bounds.width * 0.5,
            y: bounds.y - progressBounds.y + bounds.height * 0.5,
        } });
        const overlayIntercepts = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)
            ?.closest("#previewbar, #shadowPreviewbar, #miniPreviewbar"), {
            x: bounds.x + bounds.width * 0.5, y: bounds.y + bounds.height * 0.5,
        });
        expect(overlayIntercepts).toBe(false);
        const nativeHover = page.locator("#bilibili-player .bpx-player-progress-preview-time").first();
        // Bilibili lazily loads hover previews. Continue moving as a real user
        // does, instead of leaving the pointer stationary after the first enter.
        await expect.poll(async () => {
            const currentBounds = await schedule.boundingBox();
            const x = currentBounds.x + currentBounds.width * 0.5;
            const y = currentBounds.y + currentBounds.height * 0.5;
            await page.mouse.move(x - 1, y);
            await page.mouse.move(x, y);
            return (await nativeHover.textContent()).trim();
        }).toMatch(/^\d+(?::\d{2}){1,2}$/);
        const hoverSeconds = (await nativeHover.textContent()).trim().split(":").reduce((s, v) => s * 60 + Number(v), 0);
        expect(Math.abs(hoverSeconds - aligned.axisFromPlayhead * 0.5)).toBeLessThan(1.1);

        // Seeking through the rendered marks must still reach the native handler.
        await progress.click({ timeout: 10000, position: {
            x: bounds.x - progressBounds.x + bounds.width * (45 / aligned.axisFromPlayhead),
            y: bounds.y - progressBounds.y + bounds.height * 0.5,
        } });
        await expect.poll(() => page.locator("#bilibili-player video").first()
            .evaluate((video: HTMLVideoElement) => Math.abs(video.currentTime - 45))).toBeLessThan(1);
        await page.locator("#bilibili-player video").first().evaluate((video: HTMLVideoElement) => video.pause());

        // The issue page has no comments and is too short to scroll its player
        // offscreen at 720px. Resize the real browser, without changing page DOM.
        if (item.issue326) await page.setViewportSize({ width: 1280, height: 400 });
        // The native floating bar has a different pixel width but the same time axis.
        await expect.poll(async () => {
            // Scrolling also loads Bilibili's deferred comments/recommendations.
            // Retry against the current page height instead of one fixed offset.
            await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            return player.getAttribute("data-screen");
        }).toBe("mini");
        await expect(page.locator("#miniPreviewbar > li")).toHaveCount(3);
        const miniPoint = await page.locator('#miniPreviewbar [sponsorblock-category="poi_highlight"]')
            .evaluate((point: HTMLElement) => parseFloat(point.style.left));
        expect(Math.abs(miniPoint / 100 - aligned.nativeRatio)).toBeLessThan(0.00001);
        if (item.issue326) {
            // Recheck after a real reload: the API's longer length must not become our axis.
            await page.reload({ waitUntil: "domcontentloaded" });
            await waitForBilibiliContentScript(page, sendContentMessage);
            await expect(page.locator("#previewbar > li")).toHaveCount(3);
            await page.locator("#bilibili-player video").first().evaluate((video: HTMLVideoElement) => {
                video.pause(); video.currentTime = 30;
            });
            await expect.poll(async () => {
                const state = await readNativeAxis(page);
                return !state.seeking && state.currentTime === 30 &&
                    Math.abs(state.pointPercent / 100 - state.nativeRatio) < 0.00001;
            }).toBe(true);
        }
    });
}
