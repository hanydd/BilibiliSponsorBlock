import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/extension";
import { writeSyncStorage } from "./support/extensionStorage";
import { openRealBilibiliPage } from "./support/realBilibili";
import { routeMockSponsorSegments } from "./support/sponsorBlockApi";
import { waitForBilibiliContentScript } from "./support/submissionNotice";
import { getFormattedTime } from "../src/utils/formating";

const cases = [
    { name: "ordinary video", url: "https://www.bilibili.com/video/BV1JfLg6qEtf/", framework: "vue" },
    { name: "multipart video", url: "https://www.bilibili.com/video/BV1o4411M71o/?p=2", framework: "vue" },
    { name: "series list", url: "https://www.bilibili.com/list/21302388?sid=765616", framework: "vue" },
    { name: "public favorites list", url: "https://www.bilibili.com/list/ml3461007347?bvid=BV1ex411x7Em", framework: "vue" },
    { name: "membership trial", url: "https://www.bilibili.com/bangumi/play/ep1231561", framework: "next" },
    { name: "charging trial 1953", url: "https://www.bilibili.com/video/BV1mVvYBxExC/", framework: "vue", charging: true },
    { name: "charging trial 1963", url: "https://www.bilibili.com/video/BV1QcFkzQE2k/", framework: "vue", charging: true },
    { name: "charging trial 1978", url: "https://www.bilibili.com/video/BV18WciziEFN/", framework: "vue", charging: true },
    { name: "free episode", url: "https://www.bilibili.com/bangumi/play/ep733316", framework: "next" },
    { name: "season entry", url: "https://www.bilibili.com/bangumi/play/ss28747", framework: "next" },
    { name: "festival", url: "https://www.bilibili.com/festival/2021bnj", framework: "vue", floating: false },
];

async function readPlayer(page: Page) {
    return page.evaluate(() => {
        const video = document.querySelector<HTMLVideoElement>("#bilibili-player video:not(.bpx-player-seamless-replacement)");
        const player = video?.closest(".bpx-player-container");
        const label = player?.querySelector(".bpx-player-ctrl-time-duration")?.textContent?.trim() ?? "";
        const displayedDuration = /^\d+(?::\d+){1,2}$/.test(label)
            ? label.split(":").reduce((total, value) => total * 60 + Number(value), 0) : 0;
        return {
            mediaDuration: video?.duration ?? 0,
            displayedDuration,
            timelineDuration: displayedDuration > 0 && Math.abs(displayedDuration - (video?.duration ?? 0)) > 1
                ? displayedDuration : (video?.duration ?? 0),
            label,
            currentTime: video?.currentTime,
            mini: player?.getAttribute("data-screen") === "mini",
            miniProgress: !!player?.querySelector(".bpx-player-mini-progress"),
            rightControls: !!player?.querySelector(".bpx-player-control-bottom-right #bsbPlayerButtonContainer"),
            progressBar: !!player?.querySelector(".bpx-player-progress #previewbar"),
        };
    });
}

test.describe("@real playback page and floating player regression", () => {
    for (const item of cases) {
        test(`${item.name}: hydration, buttons, timeline and floating player`, async ({
            extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage,
        }, testInfo) => {
            testInfo.setTimeout(120_000);
            await writeSyncStorage(extensionServiceWorker, {
                autoHideInfoButton: false,
                showTimeWithSkips: true,
                categorySelections: [{ name: "sponsor", option: 1 }, { name: "poi_highlight", option: 1 }],
            });
            await openRealBilibiliPage(page, testInfo, item.url);
            await page.bringToFront();
            const id = await waitForBilibiliContentScript(page, sendContentMessage);
            expect(id.videoID).not.toBeNull();
            await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(1);
            await expect(page.locator("#startSegmentButton")).toBeAttached();
            await expect(page.locator("#previewbar")).toHaveCount(1);
            const logs = await sendContentMessage<{
                logs: { lifecycle: Array<{ stage: string; details: Record<string, unknown> }> };
            }>({ message: "getLogs" });
            const signal = logs.logs.lifecycle.find(entry =>
                entry.stage === "pageReady/state" && entry.details.stage === "main/pageReadyDetected"
            );
            expect(signal).toBeDefined();
            expect(signal.details.framework).toBe(item.framework);
            if (item.framework === "next") expect(signal.details.reactHydrated).toBe(true);

            const state = await readPlayer(page);
            expect(state.rightControls).toBe(true);
            expect(state.progressBar).toBe(true);
            expect(state.timelineDuration).toBeGreaterThan(40);
            if (item.name === "membership trial" || item.charging) {
                expect(state.displayedDuration).toBeGreaterThan(state.mediaDuration + 30);
            }
            if (item.charging) {
                await expect(page.getByText("试看中・开通「12元档包月充电」即可观看", { exact: true })).toBeVisible();
                expect(await page.evaluate(() => (window as unknown as {
                    __INITIAL_STATE__?: { videoData?: { is_upower_exclusive?: boolean; is_upower_preview?: boolean } };
                }).__INITIAL_STATE__?.videoData)).toMatchObject({ is_upower_exclusive: true, is_upower_preview: true });
            }
            const [bvid, cid] = id.videoID.split("+");
            const ranges: [number, number][] = [[10, 20], [30, 30], [state.timelineDuration - 20, state.timelineDuration - 10]];
            await routeMockSponsorSegments(extensionContext, bvid, ranges.map((segment, index) => ({
                segment, cid, UUID: String(index + 1).repeat(64), videoDuration: state.timelineDuration,
                category: index === 1 ? "poi_highlight" : "sponsor", actionType: index === 1 ? "poi" : "skip",
            })));
            await sendContentMessage({ message: "refreshSegments" });
            await expect(page.locator("#previewbar > li")).toHaveCount(3);
            const positions = await page.locator("#previewbar > li").evaluateAll(elements => elements.map(e => ({
                category: e.getAttribute("sponsorblock-category"),
                left: parseFloat((e as HTMLElement).style.left),
                right: parseFloat((e as HTMLElement).style.right),
            })));
            for (const [start, end] of ranges) {
                const marker = positions.find(position => Math.abs(position.left - start / state.timelineDuration * 100) < 0.001);
                expect(marker, `marker starting at ${start}s`).toBeDefined();
                if (end > start) expect(marker.right).toBeCloseTo((1 - end / state.timelineDuration) * 100, 3);
            }
            await expect(page.locator("#shadowPreviewbar > li")).toHaveCount(3);
            const expectedRemaining = getFormattedTime(state.timelineDuration - 20);
            await expect(page.locator("#sponsorBlockDurationAfterSkips")).toHaveText(` (${expectedRemaining})`);
            await page.locator("#bilibili-player video").first().evaluate((video: HTMLVideoElement) => video.pause());
            await page.locator("#bilibili-player .bpx-player-container").hover();
            await page.locator("#bilibili-player .bpx-player-control-bottom-right").hover({ timeout: 10000 });
            if (item.name === "ordinary video") {
                await page.locator(".video-page-card-small .pic").first().hover();
                await expect(page.locator(".v-recommend-inline-player video").first()).toBeAttached();
                await expect(page.locator(".v-recommend-inline-player #previewbar")).toHaveCount(0);
                await expect(page.locator(".v-recommend-inline-player #bsbPlayerButtonContainer")).toHaveCount(0);
                await expect(page.locator("#bilibili-player #previewbar > li")).toHaveCount(3);
                expect((await sendContentMessage<{ videoID: string }>({ message: "getVideoID" })).videoID).toBe(id.videoID);
            }

            // Use the site's own scroll-to-float behavior rather than injecting a synthetic mini player.
            await page.locator("#bilibili-player video").first().evaluate(async (video: HTMLVideoElement) => {
                video.currentTime = 5;
                await video.play().catch(() => undefined);
            });
            await page.mouse.move(0, 0);
            await page.evaluate(() => window.scrollTo(0, 1000));
            if (item.floating === false) {
                // This activity page has no scroll-to-float integration or mini timeline.
                expect((await readPlayer(page)).mini).toBe(false);
                await expect(page.locator("#previewbar > li")).toHaveCount(3);
            } else {
                await expect.poll(async () => (await readPlayer(page)).mini, { timeout: 5000 }).toBe(true);
                await expect(page.locator("#miniPreviewbar > li")).toHaveCount(3);
                const miniPositions = await page.locator("#miniPreviewbar > li").evaluateAll(elements => elements.map(e => ({
                    category: e.getAttribute("sponsorblock-category"),
                    left: parseFloat((e as HTMLElement).style.left),
                    right: parseFloat((e as HTMLElement).style.right),
                })));
                expect(miniPositions).toEqual(positions);
            }
            await page.evaluate(() => window.scrollTo(0, 0));
            await expect.poll(async () => (await readPlayer(page)).mini).toBe(false);
            await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(1);
            await expect(page.locator("#previewbar > li")).toHaveCount(3);
            if (item.charging) {
                await page.locator("#bilibili-player video").first().evaluate(async (video: HTMLVideoElement) => {
                    video.currentTime = video.duration - 0.2;
                    await video.play();
                });
                await expect.poll(() => page.locator("#bilibili-player video").first()
                    .evaluate((video: HTMLVideoElement) => video.ended)).toBe(true);
                await expect(page.locator("#previewbar > li")).toHaveCount(3);
                const endedPositions = await page.locator("#previewbar > li").evaluateAll(elements => elements.map(e => ({
                    category: e.getAttribute("sponsorblock-category"),
                    left: parseFloat((e as HTMLElement).style.left),
                    right: parseFloat((e as HTMLElement).style.right),
                })));
                // The site's end screen can round the full duration differently.
                // Markers must track the current native timeline rather than the initial label.
                const endedState = await readPlayer(page);
                for (const [start, end] of ranges) {
                    const marker = endedPositions.find(position =>
                        Math.abs(position.left - start / endedState.timelineDuration * 100) < 0.001);
                    expect(marker, `ended trial marker starting at ${start}s`).toBeDefined();
                    if (end > start) expect(marker.right).toBeCloseTo((1 - end / endedState.timelineDuration) * 100, 3);
                }
                await expect(page.locator("#sponsorBlockDurationAfterSkips"))
                    .toHaveText(` (${getFormattedTime(endedState.timelineDuration - 20)})`);
            }
            if (["ordinary video", "festival"].includes(item.name)) {
                // Activity pages place the player's controls below the fold. A
                // forced click can hit the page instead of the hidden control.
                await page.locator("#bilibili-player .bpx-player-container").hover();
                await page.locator(".bpx-player-ctrl-pip").hover({ timeout: 10000 });
                await page.locator(".bpx-player-ctrl-pip").click({ timeout: 10000 });
                await expect.poll(() => page.evaluate(() => {
                    const pipWindow = (window as unknown as { documentPictureInPicture?: { window?: Window } })
                        .documentPictureInPicture?.window;
                    return !!document.pictureInPictureElement || !!pipWindow;
                })).toBe(true);
                await page.evaluate(async () => {
                    if (document.pictureInPictureElement) await document.exitPictureInPicture();
                    else (window as unknown as { documentPictureInPicture?: { window?: Window } })
                        .documentPictureInPicture?.window?.close();
                });
                await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(1);
                await expect(page.locator("#previewbar > li")).toHaveCount(3);
            }
        });
    }

    for (const item of cases.filter(item => ["multipart video", "series list", "membership trial", "charging trial 1953"].includes(item.name))) {
        test(`${item.name}: next item clears old markers and uses the new timeline`, async ({
            extensionContext, extensionPage: page, extensionServiceWorker, sendContentMessage,
        }, testInfo) => {
            testInfo.setTimeout(120_000);
            await writeSyncStorage(extensionServiceWorker, {
                autoHideInfoButton: false, showTimeWithSkips: true,
                categorySelections: [{ name: "sponsor", option: 1 }],
            });
            await openRealBilibiliPage(page, testInfo, item.url);
            const before = await waitForBilibiliContentScript(page, sendContentMessage);
            await expect(page.locator("#previewbar")).toHaveCount(1);
            const [bvid, cid] = before.videoID.split("+");
            await routeMockSponsorSegments(extensionContext, bvid, [{
                segment: [10, 20], cid, UUID: "4".repeat(64), category: "sponsor", actionType: "skip",
                videoDuration: (await readPlayer(page)).timelineDuration,
            }]);
            await sendContentMessage({ message: "refreshSegments" });
            await expect(page.locator("#previewbar > li")).toHaveCount(1);
            await page.locator(".bpx-player-ctrl-next").last().click({ force: true });
            await expect.poll(async () => (await sendContentMessage<{ videoID: string }>({ message: "getVideoID" })).videoID)
                .not.toBe(before.videoID);
            const after = await sendContentMessage<{ videoID: string }>({ message: "getVideoID" });
            expect(after.videoID).not.toBeNull();
            await expect(page.locator("#previewbar > li")).toHaveCount(0);
            await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(1);
            await expect.poll(async () => (await readPlayer(page)).mediaDuration).toBeGreaterThan(40);
            const state = await readPlayer(page);
            const [nextBvid, nextCid] = after.videoID.split("+");
            await routeMockSponsorSegments(extensionContext, nextBvid, [{
                segment: [30, 40], cid: nextCid, UUID: "5".repeat(64), category: "sponsor", actionType: "skip",
                videoDuration: state.timelineDuration,
            }]);
            await sendContentMessage({ message: "refreshSegments" });
            await expect(page.locator("#previewbar > li")).toHaveCount(1);
            await expect.poll(() => page.locator("#previewbar > li").evaluate(e => parseFloat((e as HTMLElement).style.left)))
                .toBeCloseTo(30 / state.timelineDuration * 100, 3);
            await expect(page.locator("#sponsorBlockDurationAfterSkips"))
                .toHaveText(` (${getFormattedTime(state.timelineDuration - 10)})`);
        });
    }
});
