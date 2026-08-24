import { createHash } from "crypto";
import { expect, test } from "./fixtures/extension";
import { writeSyncStorage } from "./support/extensionStorage";
import { openRealBilibiliPage } from "./support/realBilibili";

const publicPages = [
    {
        name: "home",
        url: "https://www.bilibili.com/",
        cardSelector: ".recommended-container_floor-aside .container .bili-video-card",
    },
    {
        name: "video recommendations",
        url: "https://www.bilibili.com/video/BV1hUvpewEYD/",
        cardSelector: ".right-container .video-page-card-small, div.video-pod div.pod-item",
    },
    {
        name: "search",
        url: "https://search.bilibili.com/all?keyword=%E6%B5%8B%E8%AF%95",
        cardSelector: ".search-page-wrapper .bili-video-card",
    },
    {
        name: "space",
        url: "https://space.bilibili.com/2",
        cardSelector: ".space-home .bili-video-card, .space-main .bili-video-card",
        allowEmptyFeed: true,
    },
];

for (const pageInfo of publicPages) {
    test(`@real labels thumbnails on the public ${pageInfo.name} page`, async ({
        extensionContext,
        extensionPage,
        extensionServiceWorker,
    }, testInfo) => {
        testInfo.setTimeout(180_000);
        await writeSyncStorage(extensionServiceWorker, {
            dynamicAndCommentSponsorBlocker: false,
            fullVideoSegments: true,
            fullVideoLabelsOnThumbnailsMode: 1,
        });

        const requests: Array<{ prefix: string; returned: number }> = [];
        await extensionContext.route("https://www.bsbsb.top/api/videoLabels/**", async (route) => {
            const prefix = new URL(route.request().url()).pathname.split("/").pop() ?? "";
            const videoIDs = await extensionPage
                .evaluate(() => [
                    ...new Set(
                        [...document.querySelectorAll("a[href]")]
                            .map(
                                (anchor: HTMLAnchorElement) =>
                                    anchor.href.match(/\/video\/(BV1[a-zA-Z0-9]{9})/)?.[1]
                            )
                            .concat(
                                [...document.querySelectorAll("[data-key]")].map((element) =>
                                    element.getAttribute("data-key")
                                )
                            )
                            .filter((videoID): videoID is string =>
                                /^BV1[a-zA-Z0-9]{9}$/.test(videoID ?? "")
                            )
                    ),
                ])
                .catch(() => [] as string[]);
            const matchingVideoIDs = videoIDs.filter((videoID) =>
                createHash("sha256").update(videoID).digest("hex").startsWith(prefix)
            );
            requests.push({ prefix, returned: matchingVideoIDs.length });
            await route.fulfill({
                status: 200,
                contentType: "application/json; charset=utf-8",
                body: JSON.stringify(
                    matchingVideoIDs.map((videoID) => ({
                        videoID,
                        segments: [{ category: "sponsor" }],
                    }))
                ),
            });
        });

        await openRealBilibiliPage(extensionPage, testInfo, pageInfo.url);
        const cardWait = expect.poll(() => extensionPage.locator(pageInfo.cardSelector).count()).toBeGreaterThan(0);
        if (pageInfo.allowEmptyFeed) {
            await cardWait.catch(() => undefined);
            test.skip(
                (await extensionPage.locator(pageInfo.cardSelector).count()) === 0,
                "The public space video feed did not render, usually because its data request was blocked or unavailable."
            );
        } else {
            await cardWait;
        }
        await expect
            .poll(async () => {
                const state = await extensionPage.evaluate((cardSelector) => {
                    const cards = [...document.querySelectorAll(cardSelector)];
                    const labeledCards = cards.filter((card) => card.hasAttribute("data-bsb-bvid"));
                    return {
                        labeledCards: labeledCards.length,
                        visibleLabels: labeledCards.filter((card) =>
                            card.querySelector(".sponsorThumbnailLabelVisible")
                        ).length,
                    };
                }, pageInfo.cardSelector);
                return state.labeledCards > 0 && state.visibleLabels === state.labeledCards;
            })
            .toBe(true);

        const state = await extensionPage.evaluate((cardSelector) => {
            const cards = [...document.querySelectorAll(cardSelector)];
            return {
                cards: cards.length,
                labeledCards: cards.filter((card) => card.hasAttribute("data-bsb-bvid")).length,
                visibleLabels: cards.filter((card) => card.querySelector(".sponsorThumbnailLabelVisible")).length,
            };
        }, pageInfo.cardSelector);
        await testInfo.attach("thumbnail-page-diagnostics", {
            body: Buffer.from(JSON.stringify({ page: pageInfo.name, ...state, requests }, null, 2)),
            contentType: "application/json",
        });
    });
}
