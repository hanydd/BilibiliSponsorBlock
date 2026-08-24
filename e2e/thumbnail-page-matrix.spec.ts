import { expect, test } from "./fixtures/extension";
import { writeSyncStorage } from "./support/extensionStorage";
import { routeMockVideoLabels } from "./support/sponsorBlockApi";

type PageScenario = {
    name: string;
    url: string;
    body: string;
    expectedBvids: string[];
};

const bvids = {
    popupDynamic: "BV1JfLg6qEtA",
    popupFavorite: "BV1JfLg6qEtB",
    popupHistory: "BV1JfLg6qEtC",
    videoSide: "BV1JfLg6qEtD",
    videoPodSimple: "BV1JfLg6qEtE",
    videoPodNormal: "BV1JfLg6qEtF",
    listSide: "BV1JfLg6qEtG",
    listAction: "BV1JfLg6qEtH",
    search: "BV1JfLg6qEtJ",
    oldHistory: "BV1JfLg6qEtK",
    history: "BV1JfLg6qEtL",
    oldSpaceMain: "BV1JfLg6qEtM",
    oldSpaceUpload: "BV1JfLg6qEtN",
    spaceMain: "BV1JfLg6qEtP",
    spaceUpload: "BV1JfLg6qEtQ",
    channelDynamic: "BV1JfLg6qEtR",
    dynamic: "BV1JfLg6qEtS",
    festival: "BV1JfLg6qEtT",
    bewlySearch: "BV1JfLg6qEtU",
    bewlyHistory: "BV1JfLg6qEtV",
    bewlyWatchLater: "BV1JfLg6qEtW",
    bewlyFavorite: "BV1JfLg6qEtX",
    bewlyPopup: "BV1JfLg6qEtY",
};

function image(): string {
    return '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" />';
}

function defaultCard(className: string, bvid: string): string {
    return `<div class="${className}"><a href="https://www.bilibili.com/video/${bvid}"><div><picture>${image()}</picture></div></a></div>`;
}

function mockPage(body: string): string {
    return `
<!DOCTYPE html>
<html>
    <head><meta charset="utf-8" /><title>Thumbnail Matrix</title></head>
    <body>
        <div id="app"></div>
        ${body}
        <script>
            setTimeout(() => {
                const app = document.querySelector("#app");
                app.__vue_app__ = {};
                app.dataset.e2eHydrated = "true";
            }, 50);
        </script>
    </body>
</html>`;
}

const nativeScenarios: PageScenario[] = [
    {
        name: "common header popups",
        url: "https://www.bilibili.com/?e2e=header-popups",
        body: `
            <header class="bili-header"><div class="right-entry">
                <div class="v-popover-wrap"></div><div class="v-popover-wrap"></div>
                <div class="v-popover-wrap"><a data-mod="top_right_bar_window_dynamic" href="https://www.bilibili.com/video/${bvids.popupDynamic}"><div><picture>${image()}</picture></div></a></div>
                <div class="v-popover-wrap"><a data-mod="top_right_bar_window_default_collection" href="https://www.bilibili.com/video/${bvids.popupFavorite}"><div><picture>${image()}</picture></div></a></div>
                <div class="v-popover-wrap"><a class="header-history-card" href="https://www.bilibili.com/video/${bvids.popupHistory}"><div><picture>${image()}</picture></div></a></div>
            </div></header>`,
        expectedBvids: [bvids.popupDynamic, bvids.popupFavorite, bvids.popupHistory],
    },
    {
        name: "video side recommendations and both playlist layouts",
        url: "https://www.bilibili.com/video/BV1hUvpewEYD/",
        body: `
            <div class="right-container"><div class="video-page-card-small"><a href="https://www.bilibili.com/video/${bvids.videoSide}"><div class="b-img">${image()}</div></a></div></div>
            <div class="video-pod">
                <div class="pod-item simple" data-key="${bvids.videoPodSimple}"><div class="single-p"><div class="stats"></div></div></div>
                <div class="pod-item normal" data-key="${bvids.videoPodNormal}"><div class="single-p">${image()}</div></div>
            </div>`,
        expectedBvids: [bvids.videoSide, bvids.videoPodSimple, bvids.videoPodNormal],
    },
    {
        name: "list side recommendations and action list",
        url: "https://www.bilibili.com/list/watchlater?bvid=BV1hUvpewEYD",
        body: `
            <div class="recommend-list-container">${defaultCard("video-card", bvids.listSide)}</div>
            <div id="playlist-video-action-list-body">${defaultCard("action-list-item", bvids.listAction)}</div>`,
        expectedBvids: [bvids.listSide, bvids.listAction],
    },
    {
        name: "search results",
        url: "https://search.bilibili.com/all?keyword=e2e",
        body: `<div class="search-page-wrapper">${defaultCard("bili-video-card", bvids.search)}</div>`,
        expectedBvids: [bvids.search],
    },
    {
        name: "old history",
        url: "https://www.bilibili.com/account/history",
        body: `<ul class="list-contain"><li class="history-record"><a class="preview" href="https://www.bilibili.com/video/${bvids.oldHistory}">${image()}</a></li></ul>`,
        expectedBvids: [bvids.oldHistory],
    },
    {
        name: "current history",
        url: "https://www.bilibili.com/history",
        body: `<div class="main-content"><div class="history-card"><a href="https://www.bilibili.com/video/${bvids.history}"><div class="bili-cover-card__thumbnail">${image()}</div></a></div></div>`,
        expectedBvids: [bvids.history],
    },
    {
        name: "old and current space layouts plus channel dynamics",
        url: "https://space.bilibili.com/2",
        body: `
            <div class="s-space"><div class="i-pin-v">${defaultCard("i-pin-part", bvids.oldSpaceMain)}</div>${defaultCard("small-item", bvids.oldSpaceUpload)}</div>
            <div class="space-home">${defaultCard("bili-video-card", bvids.spaceMain)}</div>
            <div class="space-main">${defaultCard("bili-video-card", bvids.spaceUpload)}</div>
            <div class="bili-dyn-list"><div class="bili-dyn-list__items"></div>${defaultCard("bili-dyn-content", bvids.channelDynamic)}</div>`,
        expectedBvids: [
            bvids.oldSpaceMain,
            bvids.oldSpaceUpload,
            bvids.spaceMain,
            bvids.spaceUpload,
            bvids.channelDynamic,
        ],
    },
    {
        name: "dynamic feed",
        url: "https://t.bilibili.com/",
        body: `<section><div class="bili-dyn-list"><div class="bili-dyn-list__items"></div>${defaultCard("bili-dyn-content", bvids.dynamic)}</div></section>`,
        expectedBvids: [bvids.dynamic],
    },
    {
        name: "festival episodes",
        url: "https://www.bilibili.com/festival/e2e?bvid=BV1hUvpewEYD",
        body: `<div class="video-sections"><div class="video-episode-card"><a href="https://www.bilibili.com/video/${bvids.festival}"><div class="activity-image-card__image">${image()}</div></a></div></div>`,
        expectedBvids: [bvids.festival],
    },
];

const bewlyScenarios: PageScenario[] = [
    {
        name: "Bewly search",
        url: "https://www.bilibili.com/?page=SearchResults&e2e=1",
        body: `<div class="search-results-panel"><div class="virtual-item"><a href="https://www.bilibili.com/video/${bvids.bewlySearch}"><img class="image-transition" /></a></div></div>`,
        expectedBvids: [bvids.bewlySearch],
    },
    {
        name: "Bewly history",
        url: "https://www.bilibili.com/?page=History&e2e=1",
        body: `<div class="bewly-scroll-viewport"><a class="group" href="https://www.bilibili.com/video/${bvids.bewlyHistory}"><section>${image()}</section></a></div>`,
        expectedBvids: [bvids.bewlyHistory],
    },
    {
        name: "Bewly watch later",
        url: "https://www.bilibili.com/?page=WatchLater&e2e=1",
        body: `<div class="bewly-scroll-viewport"><a class="group" href="https://www.bilibili.com/video/${bvids.bewlyWatchLater}"><section>${image()}</section></a></div>`,
        expectedBvids: [bvids.bewlyWatchLater],
    },
    {
        name: "Bewly favorites",
        url: "https://www.bilibili.com/?page=Favorites&e2e=1",
        body: `<div class="video-card-grid-container"><div class="virtual-item"><a href="https://www.bilibili.com/video/${bvids.bewlyFavorite}"><picture>${image()}</picture></a></div></div>`,
        expectedBvids: [bvids.bewlyFavorite],
    },
    {
        name: "Bewly common popup",
        url: "https://www.bilibili.com/?page=SearchResults&e2e=popup",
        body: `<div class="top-bar-header__side top-bar-header__side--right"><a class="group" href="https://www.bilibili.com/video/${bvids.bewlyPopup}"><picture>${image()}</picture></a></div>`,
        expectedBvids: [bvids.bewlyPopup],
    },
];

test.beforeEach(async ({ extensionServiceWorker }) => {
    await writeSyncStorage(extensionServiceWorker, {
        dynamicAndCommentSponsorBlocker: false,
        fullVideoSegments: true,
        fullVideoLabelsOnThumbnailsMode: 1,
    });
});

test("labels every supported native thumbnail container", async ({ extensionContext, extensionPage }) => {
    const allBvids = nativeScenarios.flatMap(({ expectedBvids }) => expectedBvids);
    await routeMockVideoLabels(
        extensionContext,
        allBvids.map((videoID) => ({ videoID, category: "sponsor" }))
    );
    for (const scenario of nativeScenarios) {
        await extensionPage.route(scenario.url, async (route) => {
            await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: mockPage(scenario.body) });
        });
    }

    for (const scenario of nativeScenarios) {
        await test.step(scenario.name, async () => {
            await extensionPage.goto(scenario.url);
            await expect(extensionPage.locator("#app")).toHaveAttribute("data-e2e-hydrated", "true");
            for (const bvid of scenario.expectedBvids) {
                const card = extensionPage.locator(`[data-bsb-bvid="${bvid}"]`);
                await expect(card, `${scenario.name}: ${bvid}`).toHaveCount(1);
                await expect(card.locator(".sponsorThumbnailLabelVisible")).toHaveCount(1);
            }
        });
    }
});

test("labels every supported Bewly shadow-root container", async ({ extensionContext, extensionPage }) => {
    const allBvids = bewlyScenarios.flatMap(({ expectedBvids }) => expectedBvids);
    await routeMockVideoLabels(
        extensionContext,
        allBvids.map((videoID) => ({ videoID, category: "sponsor" }))
    );
    for (const scenario of bewlyScenarios) {
        await extensionPage.route(scenario.url, async (route) => {
            const html = mockPage(`
                <script>
                    setTimeout(() => {
                        const host = document.createElement("div");
                        host.id = "bewly";
                        const root = host.attachShadow({ mode: "open" });
                        root.innerHTML = ${JSON.stringify(scenario.body)};
                        document.body.appendChild(host);
                    }, 300);
                </script>
            `);
            await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
        });
    }

    for (const scenario of bewlyScenarios) {
        await test.step(scenario.name, async () => {
            await extensionPage.goto(scenario.url);
            for (const bvid of scenario.expectedBvids) {
                await expect
                    .poll(() =>
                        extensionPage.locator("#bewly").evaluate((host, expectedBvid) => {
                            const card = host.shadowRoot?.querySelector(`[data-bsb-bvid="${expectedBvid}"]`);
                            return {
                                cards: card ? 1 : 0,
                                labels: card?.querySelectorAll(".sponsorThumbnailLabelVisible").length ?? 0,
                            };
                        }, bvid)
                    )
                    .toEqual({ cards: 1, labels: 1 });
            }
        });
    }
});
