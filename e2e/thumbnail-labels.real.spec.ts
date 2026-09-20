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
    ...["sponsor", "exclusive_access"].map((category) => ({
        name: `home with replaced covers (${category})`,
        url: "https://www.bilibili.com/",
        cardSelector: ".recommended-container_floor-aside .container .bili-video-card",
        replaceCover: true,
        category,
    })),
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
                        segments: [{ category: "category" in pageInfo ? pageInfo.category : "sponsor" }],
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

        // Check rendered visibility as well as the extension's visible class.
        const firstLabel = extensionPage.locator(pageInfo.cardSelector).locator(".sponsorThumbnailLabelVisible").first();
        await expect(firstLabel).toBeVisible();

        if ("replaceCover" in pageInfo) {
            // Reproduce the DOM/CSS contract of Bilibili-Evolved's replace-cover component.
            // https://github.com/the1812/Bilibili-Evolved/tree/master/registry/lib/components/style/replace-cover
            // The page, cards, images and extension are real; label responses are mocked above.
            const card = extensionPage.locator(pageInfo.cardSelector)
                .filter({ has: extensionPage.locator(".sponsorThumbnailLabelVisible") }).first();
            const cover = card.locator(".bili-video-card__image--wrap");
            const picture = cover.locator("picture");
            const label = card.locator(".sponsorThumbnailLabelVisible");
            await card.scrollIntoViewIfNeeded();
            await extensionPage.mouse.move(0, 0);
            await extensionPage.addStyleTag({ content: `
                .bili-video-card .bili-video-card__image--wrap { position: relative; }
                .bili-video-card .bili-video-card__image--wrap picture { visibility: hidden !important; }
                .bili-video-card .bili-video-card__image--wrap .custom-preview-img {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                    object-fit: cover; z-index: 2; opacity: 0; transition: opacity .3s ease;
                    border-radius: inherit;
                }
                .bili-video-card .bili-video-card__image--wrap .custom-preview-img.loaded { opacity: 1; }
                .bili-video-card .bili-video-card__image--wrap:hover .custom-preview-img.loaded { opacity: 0; }
                .bili-video-card .bili-video-card__image--wrap:hover picture { visibility: visible !important; }
            ` });
            await cover.evaluate((element) => {
                const original = element.querySelector("picture img") as HTMLImageElement;
                const replacement = document.createElement("img");
                replacement.src = original.currentSrc || original.src;
                replacement.className = "custom-preview-img loaded";
                element.appendChild(replacement);
            });
            await expect(picture).toBeHidden();
            await expect(label).toBeVisible();
            await expect(label).toHaveAttribute("data-category", pageInfo.category);
            expect(await label.evaluate((element) => element.closest("picture") === null)).toBe(true);
            // A visible box alone would miss an opaque image painted above the icon.
            await expect.poll(() => label.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
            })).toBe(true);
            await cover.hover({ position: { x: 120, y: 80 } });
            await expect(picture).toBeVisible();
            await expect(label).toBeVisible();
            await extensionPage.mouse.move(0, 0);
            await expect(picture).toBeHidden();
            await expect(label).toBeVisible();
            await testInfo.attach("replaced-cover-label", {
                body: await card.screenshot(),
                contentType: "image/png",
            });
        }

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
