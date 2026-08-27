import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures/extension";
import { writeSyncStorage } from "./support/extensionStorage";
import { openRealBilibiliPage } from "./support/realBilibili";
import { getLifecycleLogs } from "./support/lifecycle";
import { routeMockSponsorSegments } from "./support/sponsorBlockApi";
import { waitForBilibiliContentScript } from "./support/submissionNotice";

const highlightBvid = "BV1hUvpewEYD";
const highlightCid = "500001630059892";
const highlightTime = 34.8;
const highlightVideoUrl =
    "https://www.bilibili.com/video/BV1hUvpewEYD/?vd_source=ef7071b8c0d57f1fcef22eaecd6156e8";

type SendContentMessage = <TResponse = unknown>(message: unknown) => Promise<TResponse>;

type SegmentInfoResponse = {
    status?: number;
    sponsorTimes?: Array<{
        segment: [number, number];
        category: string;
        actionType: string;
        cid: string;
    }>;
};

const highlightMarkerSelector =
    '#previewbar > .previewbar[sponsorblock-category="poi_highlight"]';
const highlightButtonSelector = ".skipButtonControlBarContainer";

async function waitForSegmentState(
    sendContentMessage: SendContentMessage,
    expectedBvid: string,
    expectedSegmentCount: number
): Promise<void> {
    await expect
        .poll(async () => {
            const [video, info] = await Promise.all([
                sendContentMessage<{ videoID: string | null }>({ message: "getVideoID" }),
                sendContentMessage<SegmentInfoResponse>({
                    message: "isInfoFound",
                    updating: false,
                }).catch(() => undefined),
            ]);

            return {
                bvid: video.videoID?.split("+")[0] ?? null,
                status: info?.status,
                segmentCount: info?.sponsorTimes?.length,
            };
        })
        .toEqual({
            bvid: expectedBvid,
            status: 200,
            segmentCount: expectedSegmentCount,
        });
}

async function expectHighlightVisible(
    page: Page,
    sendContentMessage: SendContentMessage
): Promise<void> {
    await waitForSegmentState(sendContentMessage, highlightBvid, 1);

    const marker = page.locator(highlightMarkerSelector);
    await expect(marker).toHaveCount(1);
    await expect
        .poll(() => marker.evaluate((element) => parseFloat((element as HTMLElement).style.left)))
        .toBeGreaterThan(13);
    await expect
        .poll(() => marker.evaluate((element) => parseFloat((element as HTMLElement).style.left)))
        .toBeLessThan(14);

    const button = page.locator(highlightButtonSelector);
    await expect(button).toBeVisible();
    await expect(button).not.toHaveClass(/sbhidden/);
    await expect(button.locator("#sbSkipIconControlBarButton")).toHaveAttribute("title", /.+/);
}

async function seekVideo(page: Page, time: number): Promise<void> {
    await page.locator("#bilibili-player video").first().evaluate(
        (video: HTMLVideoElement, nextTime: number) => {
            video.pause();
            video.currentTime = nextTime;
            video.dispatchEvent(new Event("seeking"));
        },
        time
    );
}

async function findDifferentVisibleVideoLink(page: Page): Promise<Locator> {
    const links = page.locator('a[href*="/video/"]');
    await expect.poll(() => links.count()).toBeGreaterThan(0);

    const linkCount = await links.count();
    for (let index = 0; index < linkCount; index++) {
        const link = links.nth(index);
        const candidate = await link.evaluate((element: HTMLAnchorElement) => {
            const url = new URL(element.href, window.location.href);
            const bvid = url.pathname.match(/\/video\/(BV1[a-zA-Z0-9]{9})/)?.[1] ?? null;
            const rect = element.getBoundingClientRect();
            return {
                bvid,
                visible: rect.width > 0 && rect.height > 0,
            };
        });

        if (candidate.visible && candidate.bvid && candidate.bvid !== highlightBvid) {
            return link;
        }
    }

    throw new Error("No visible Bilibili video link was available for an SPA navigation test.");
}

test.describe("@real highlight rendering on Bilibili", () => {
    test.beforeEach(async ({
        extensionContext,
        extensionPage,
        extensionServiceWorker,
    }, testInfo) => {
        testInfo.setTimeout(180_000);
        await writeSyncStorage(extensionServiceWorker, {
            autoHideInfoButton: false,
            hideSkipButtonPlayerControls: false,
            skipNoticeDuration: 1,
        });
        await routeMockSponsorSegments(extensionContext, highlightBvid, [
            {
                segment: [highlightTime, highlightTime],
                UUID: "b9975b5142c19c930eb9988444f93f9df4b2ae75401e02848ddad0f99e4f8f347",
                category: "poi_highlight",
                actionType: "poi",
                cid: highlightCid,
                videoDuration: 259.041,
            },
        ]);
        await openRealBilibiliPage(extensionPage, testInfo, highlightVideoUrl);
    });

    test("updates the highlight button when seeking across the highlight", async ({
        extensionPage,
        sendContentMessage,
    }) => {
        const videoId = await waitForBilibiliContentScript(extensionPage, sendContentMessage);
        expect(videoId.videoID).toBe(`${highlightBvid}+${highlightCid}`);
        await expectHighlightVisible(extensionPage, sendContentMessage);

        await seekVideo(extensionPage, 60);
        await expect(extensionPage.locator(highlightMarkerSelector)).toHaveCount(1);
        await expect(extensionPage.locator(highlightButtonSelector)).toHaveClass(/sbhidden/);

        await seekVideo(extensionPage, 5);
        await expectHighlightVisible(extensionPage, sendContentMessage);
    });

    test("keeps the highlight button stable after the time control", async ({
        extensionPage,
        sendContentMessage,
    }) => {
        await waitForBilibiliContentScript(extensionPage, sendContentMessage);
        await expectHighlightVisible(extensionPage, sendContentMessage);

        const leftControls = extensionPage.locator(".bpx-player-control-bottom-left");
        const playButton = leftControls.locator(".bpx-player-ctrl-play");
        const timeControl = leftControls.locator(".bpx-player-ctrl-time");
        const highlightButton = leftControls.locator(highlightButtonSelector);

        await expect
            .poll(() =>
                highlightButton.evaluate((element) =>
                    element.previousElementSibling?.classList.contains("bpx-player-ctrl-time")
                )
            )
            .toBe(true);

        const timeBox = await timeControl.boundingBox();
        const highlightBox = await highlightButton.boundingBox();
        expect(timeBox).not.toBeNull();
        expect(highlightBox).not.toBeNull();
        expect(highlightBox!.x).toBeGreaterThanOrEqual(timeBox!.x + timeBox!.width - 1);

        await extensionPage.waitForTimeout(1200);
        await expect(highlightButton).toBeVisible();

        await extensionPage.mouse.move(0, 0);
        const playButtonBeforeHover = await playButton.boundingBox();
        await playButton.hover();
        const playButtonAfterHover = await playButton.boundingBox();
        expect(playButtonBeforeHover).not.toBeNull();
        expect(playButtonAfterHover).not.toBeNull();
        expect(playButtonAfterHover!.x).toBeCloseTo(playButtonBeforeHover!.x, 3);
        await expect(highlightButton).toBeVisible();

        await highlightButton.click();
        await expect
            .poll(() =>
                extensionPage
                    .locator("#bilibili-player video")
                    .first()
                    .evaluate((video: HTMLVideoElement) => video.currentTime)
            )
            .toBeGreaterThanOrEqual(highlightTime);
        await expect(highlightButton).toHaveClass(/sbhidden/);
    });

    test("clears and restores the highlight across real SPA video routes", async ({
        extensionPage,
        sendContentMessage,
    }, testInfo) => {
        await waitForBilibiliContentScript(extensionPage, sendContentMessage);
        await expectHighlightVisible(extensionPage, sendContentMessage);

        const routeLink = await findDifferentVisibleVideoLink(extensionPage);
        const destinationBvid = await routeLink.evaluate(
            (element: HTMLAnchorElement) =>
                new URL(element.href, window.location.href).pathname.match(
                    /\/video\/(BV1[a-zA-Z0-9]{9})/
                )?.[1] ?? null
        );
        expect(destinationBvid).not.toBeNull();

        const documentToken = `highlight-e2e-${Date.now()}`;
        await extensionPage.evaluate((token) => {
            window["__BSB_HIGHLIGHT_E2E_DOCUMENT__"] = token;
        }, documentToken);
        await routeLink.evaluate((element: HTMLAnchorElement) => element.removeAttribute("target"));

        await Promise.all([
            extensionPage.waitForURL(
                (url) => url.pathname.includes(`/video/${destinationBvid}`),
                { timeout: 60_000 }
            ),
            routeLink.click(),
        ]);
        expect(
            await extensionPage.evaluate(
                (token) => window["__BSB_HIGHLIGHT_E2E_DOCUMENT__"] === token,
                documentToken
            )
        ).toBe(true);

        await waitForSegmentState(sendContentMessage, destinationBvid, 0);
        await expect(extensionPage.locator(highlightMarkerSelector)).toHaveCount(0);
        await expect(extensionPage.locator(highlightButtonSelector)).toHaveClass(/sbhidden/);

        await Promise.all([
            extensionPage.waitForURL(
                (url) => url.pathname.includes(`/video/${highlightBvid}`),
                { timeout: 60_000 }
            ),
            extensionPage.goBack(),
        ]);
        expect(
            await extensionPage.evaluate(
                (token) => window["__BSB_HIGHLIGHT_E2E_DOCUMENT__"] === token,
                documentToken
            )
        ).toBe(true);

        await expectHighlightVisible(extensionPage, sendContentMessage);
        await expect(extensionPage.locator("#previewbar")).toHaveCount(1);
        await expect(extensionPage.locator("#bsbPlayerButtonContainer")).toHaveCount(1);

        const lifecycle = await getLifecycleLogs(sendContentMessage);
        const diagnostics = {
            currentTime: await extensionPage
                .locator("#bilibili-player video")
                .first()
                .evaluate((video: HTMLVideoElement) => video.currentTime),
            buttonClasses: await extensionPage
                .locator(highlightButtonSelector)
                .evaluateAll((elements) => elements.map((element) => element.className)),
            skipButtonLifecycle: lifecycle.filter((entry) => entry.stage.startsWith("skipButton/")),
        };
        await testInfo.attach("highlight-spa-diagnostics", {
            body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
            contentType: "application/json",
        });
    });
});
