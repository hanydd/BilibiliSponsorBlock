import { expect, test } from "./fixtures/extension";
import { writeSyncStorage } from "./support/extensionStorage";
import { routeMockVideoLabels } from "./support/sponsorBlockApi";

const bvid = (index: number) => `BV1${String(index).padStart(9, "0")}`;

// A clipped playlist is different from an ordinary page scroller: every row is in
// the DOM, but only four rows fit in its own viewport.
test("only fetches visible playlist labels and updates cards as the playlist changes", async ({
    extensionContext,
    extensionPage,
    extensionServiceWorker,
}) => {
    await writeSyncStorage(extensionServiceWorker, {
        fullVideoSegments: true,
        fullVideoLabelsOnThumbnailsMode: 1,
        dynamicAndCommentSponsorBlocker: false,
    });
    const requests: string[] = [];
    await routeMockVideoLabels(
        extensionContext,
        Array.from({ length: 992 }, (_, index) => ({
            videoID: bvid(index),
            category: index === 991 ? "selfpromo" : "sponsor",
        })),
        (url) => requests.push(url)
    );
    const url = "https://www.bilibili.com/video/BV1hUvpewEYD/";
    await extensionPage.route(url, (route) => route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head><style>
            body { margin: 0; }
            .video-pod { display: none; width: 350px; height: 200px; overflow: auto; }
            .pod-item { height: 50px; box-sizing: border-box; }
            .stats { display: inline-block; width: 20px; height: 10px; }
        </style></head><body><div id="app"></div><div class="video-pod">
            ${Array.from({ length: 990 }, (_, index) => `<div class="pod-item simple" data-key="${bvid(index)}">
                <div class="single-p">Video ${index}<div class="stats"></div></div>
            </div>`).join("")}
        </div><script>document.querySelector('#app').__vue_app__ = {};</script></body></html>`,
    }));
    await extensionPage.goto(url);
    const playlist = extensionPage.locator(".video-pod");
    const rows = playlist.locator(".pod-item");
    await expect(extensionPage.locator("[data-bsb-icon-definition]")).toHaveCount(1);
    await extensionPage.waitForTimeout(300);
    expect(requests).toHaveLength(0);
    await expect(playlist.locator("[data-bsb-bvid]")).toHaveCount(0);
    await playlist.evaluate((element) => {
        (element as HTMLElement).style.display = "block";
    });
    await expect(rows.nth(0).locator(".sponsorThumbnailLabelVisible")).toHaveCount(1);
    await expect(rows.nth(3).locator(".sponsorThumbnailLabelVisible")).toHaveCount(1);
    await extensionPage.waitForTimeout(300);
    expect(await playlist.locator("[data-bsb-bvid]").count()).toBeLessThanOrEqual(5);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.length).toBeLessThanOrEqual(5);
    const initialRequestCount = requests.length;

    // Reusing a row outside the scroll viewport must not start a request.
    await rows.nth(500).evaluate((row, id) => row.setAttribute("data-key", id), bvid(990));
    await extensionPage.waitForTimeout(300);
    await expect(rows.nth(500)).not.toHaveAttribute("data-bsb-bvid");
    expect(requests).toHaveLength(initialRequestCount);

    // Expanding a previously hidden playlist should pick up the new visible rows.
    await playlist.evaluate((element) => {
        (element as HTMLElement).style.display = "none";
    });
    await extensionPage.waitForTimeout(100);
    await playlist.evaluate((element) => {
        (element as HTMLElement).style.display = "block";
        element.scrollTop = 500 * 50;
    });
    await expect(rows.nth(500)).toHaveAttribute("data-bsb-bvid", bvid(990));
    await expect(rows.nth(500).locator(".sponsorThumbnailLabelVisible")).toHaveCount(1);
    expect(await playlist.locator("[data-bsb-bvid]").count()).toBeLessThanOrEqual(11);
    expect(requests.length).toBeLessThanOrEqual(11);

    // Virtual lists can reuse a visible node by changing data-key, without href changes.
    await rows.nth(500).evaluate((row, id) => row.setAttribute("data-key", id), bvid(991));
    await expect(rows.nth(500).locator(".sponsorThumbnailLabelVisible")).toHaveAttribute("data-category", "selfpromo");

    // A framework replacing the cover/anchor must still restore exactly one label.
    await rows.nth(500).locator(".single-p").evaluate((element) => {
        element.innerHTML = '<div class="stats"></div>';
    });
    await expect(rows.nth(500).locator(".sponsorThumbnailLabelVisible")).toHaveAttribute("data-category", "selfpromo");
    await expect(rows.nth(500).locator(".sponsorThumbnailLabel")).toHaveCount(1);

    // Appended cards are observed, and an old removed row must not keep being processed.
    await rows.nth(500).evaluate((row, id) => {
        const replacement = document.createElement("div");
        replacement.className = "pod-item simple";
        replacement.setAttribute("data-key", id);
        replacement.innerHTML = '<div class="single-p"><div class="stats"></div></div>';
        row.replaceWith(replacement);
    }, bvid(500));
    await expect(rows.nth(500)).toHaveAttribute("data-bsb-bvid", bvid(500));
    await expect(rows.nth(500).locator(".sponsorThumbnailLabelVisible")).toHaveCount(1);
});
