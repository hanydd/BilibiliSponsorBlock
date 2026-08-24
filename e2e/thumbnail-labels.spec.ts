import { expect, test } from "./fixtures/extension";
import {
    bewlyHomeBvid,
    hydratedHomeBvid,
    initialHomeBvid,
    replacementHomeBvid,
    replaceNativeHomeContainer,
    routeMockBilibiliHomePage,
} from "./support/bilibiliHomePage";
import { writeSyncStorage } from "./support/extensionStorage";
import { routeMockVideoLabels } from "./support/sponsorBlockApi";

const labelSelector = ".sponsorThumbnailLabel";

test.beforeEach(async ({ extensionServiceWorker }) => {
    await writeSyncStorage(extensionServiceWorker, {
        fullVideoSegments: true,
        fullVideoLabelsOnThumbnailsMode: 1,
    });
});

test("labels native home cards without touching SSR DOM before hydration", async ({
    extensionContext,
    extensionPage,
}) => {
    const labelRequests: string[] = [];
    await routeMockVideoLabels(
        extensionContext,
        [{ videoID: hydratedHomeBvid, category: "sponsor" }],
        (url) => labelRequests.push(url)
    );
    await routeMockBilibiliHomePage(extensionPage, {
        hydrationDelayMs: 1_200,
        replaceCardOnHydration: true,
    });

    await extensionPage.goto("https://www.bilibili.com/");
    await extensionPage.waitForTimeout(400);
    await expect(extensionPage.locator("#app")).not.toHaveAttribute("data-e2e-hydrated", "true");
    await expect(extensionPage.locator(labelSelector)).toHaveCount(0);
    await expect(extensionPage.locator("[data-bsb-icon-definition]")).toHaveCount(0);

    await expect(extensionPage.locator("#app")).toHaveAttribute("data-e2e-hydrated", "true");
    const hydratedCard = extensionPage.locator('[data-e2e-generation="hydrated"]');
    await expect(hydratedCard).toHaveAttribute("data-bsb-bvid", hydratedHomeBvid);
    await expect(hydratedCard.locator(`${labelSelector}.sponsorThumbnailLabelVisible`)).toHaveCount(1);
    await expect(extensionPage.locator(labelSelector)).toHaveCount(1);
    await expect(extensionPage.locator("[data-bsb-icon-definition]")).toHaveCount(1);
    expect(labelRequests).toHaveLength(1);
    await expect(extensionPage.locator("#bewly")).toHaveCount(0);
});

test("keeps native labels working and labels a delayed Bewly shadow root", async ({
    extensionContext,
    extensionPage,
}) => {
    const labelRequests: string[] = [];
    await routeMockVideoLabels(
        extensionContext,
        [
            { videoID: initialHomeBvid, category: "sponsor" },
            { videoID: bewlyHomeBvid, category: "selfpromo" },
        ],
        (url) => labelRequests.push(url)
    );
    await routeMockBilibiliHomePage(extensionPage, {
        hydrationDelayMs: 100,
        bewlyDelayMs: 1_200,
    });

    await extensionPage.goto("https://www.bilibili.com/");
    const nativeCard = extensionPage.locator('[data-e2e-generation="ssr"]');
    await expect(nativeCard).toHaveAttribute("data-bsb-bvid", initialHomeBvid);
    await expect(nativeCard.locator(`${labelSelector}.sponsorThumbnailLabelVisible`)).toHaveCount(1);

    await expect
        .poll(() =>
            extensionPage.locator("#bewly").evaluate((host) => ({
                bvid: host.shadowRoot?.querySelector(".video-card")?.getAttribute("data-bsb-bvid") ?? null,
                labels: host.shadowRoot?.querySelectorAll(".sponsorThumbnailLabelVisible").length ?? 0,
                styles: host.shadowRoot?.querySelectorAll("link[data-bsb-thumbnail-styles]").length ?? 0,
                iconDefinitions: host.shadowRoot?.querySelectorAll("[data-bsb-icon-definition]").length ?? 0,
            }))
        )
        .toEqual({
            bvid: bewlyHomeBvid,
            labels: 1,
            styles: 1,
            iconDefinitions: 1,
        });
    expect(labelRequests).toHaveLength(2);
});

test("reattaches after the native thumbnail container is replaced", async ({
    extensionContext,
    extensionPage,
}) => {
    await routeMockVideoLabels(extensionContext, [
        { videoID: initialHomeBvid, category: "sponsor" },
        { videoID: replacementHomeBvid, category: "selfpromo" },
    ]);
    await routeMockBilibiliHomePage(extensionPage, { hydrationDelayMs: 100 });

    await extensionPage.goto("https://www.bilibili.com/");
    await expect(extensionPage.locator('[data-e2e-generation="ssr"]')).toHaveAttribute(
        "data-bsb-bvid",
        initialHomeBvid
    );

    await replaceNativeHomeContainer(extensionPage, replacementHomeBvid);

    const replacementCard = extensionPage.locator('[data-e2e-generation="replacement"]');
    await expect(replacementCard).toHaveAttribute("data-bsb-bvid", replacementHomeBvid);
    await expect(replacementCard.locator(`${labelSelector}.sponsorThumbnailLabelVisible`)).toHaveCount(1);
    await expect(extensionPage.locator(labelSelector)).toHaveCount(1);
});

test("relabels a reused card when its link changes during an in-flight request", async ({
    extensionContext,
    extensionPage,
}) => {
    let releaseFirstRequest = () => undefined;
    const firstRequestGate = new Promise<void>((resolve) => {
        releaseFirstRequest = resolve;
    });
    let requestCount = 0;
    await extensionContext.route("https://www.bsbsb.top/api/videoLabels/**", async (route) => {
        requestCount++;
        if (requestCount === 1) await firstRequestGate;
        await route.fulfill({
            status: 200,
            contentType: "application/json; charset=utf-8",
            body: JSON.stringify([
                { videoID: initialHomeBvid, segments: [{ category: "sponsor" }] },
                { videoID: replacementHomeBvid, segments: [{ category: "selfpromo" }] },
            ]),
        });
    });
    await routeMockBilibiliHomePage(extensionPage, { hydrationDelayMs: 100 });

    await extensionPage.goto("https://www.bilibili.com/");
    const card = extensionPage.locator('[data-e2e-generation="ssr"]');
    await expect(card).toHaveAttribute("data-bsb-bvid", initialHomeBvid);

    await card.locator("a").evaluate((link: HTMLAnchorElement, bvid: string) => {
        link.href = `https://www.bilibili.com/video/${bvid}`;
    }, replacementHomeBvid);
    await extensionPage.waitForTimeout(100);
    releaseFirstRequest();

    await expect(card).toHaveAttribute("data-bsb-bvid", replacementHomeBvid);
    await expect(card.locator(`${labelSelector}.sponsorThumbnailLabelVisible`)).toHaveAttribute(
        "data-category",
        "selfpromo"
    );
    expect(requestCount).toBeGreaterThanOrEqual(2);
});
