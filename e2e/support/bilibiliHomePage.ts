import type { Page } from "@playwright/test";

export const initialHomeBvid = "BV1JfLg6qEtf";
export const hydratedHomeBvid = "BV1hUvpewEYD";
export const replacementHomeBvid = "BV1TiuZ6TEQw";
export const bewlyHomeBvid = "BV13bgn6gEg1";

type MockBilibiliHomePageOptions = {
    hydrationDelayMs?: number;
    replaceCardOnHydration?: boolean;
    bewlyDelayMs?: number;
};

function createNativeCardHtml(bvid: string, generation: string): string {
    return `
        <div class="bili-video-card" data-e2e-generation="${generation}">
            <a href="https://www.bilibili.com/video/${bvid}">
                <div class="bili-video-card__image">
                    <picture><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" /></picture>
                </div>
            </a>
        </div>
    `;
}

function createBewlyCardHtml(bvid: string): string {
    return `
        <div class="video-card">
            <a href="https://www.bilibili.com/video/${bvid}">
                <div class="vertical-card-cover">
                    <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" />
                </div>
            </a>
        </div>
    `;
}

function createMockHomePageHtml(options: MockBilibiliHomePageOptions): string {
    const hydrationDelayMs = options.hydrationDelayMs ?? 100;
    const replaceCardOnHydration = options.replaceCardOnHydration ?? false;
    const bewlyDelayMs = options.bewlyDelayMs;

    return `
<!DOCTYPE html>
<html>
    <head><meta charset="utf-8" /><title>Mock Bilibili Home</title></head>
    <body>
        <div id="app"></div>
        <main class="recommended-container_floor-aside">
            <div class="container">
                ${createNativeCardHtml(initialHomeBvid, "ssr")}
            </div>
        </main>
        <script>
            const hydrate = () => {
                const container = document.querySelector(".recommended-container_floor-aside .container");
                if (${JSON.stringify(replaceCardOnHydration)}) {
                    container.innerHTML = ${JSON.stringify(createNativeCardHtml(hydratedHomeBvid, "hydrated"))};
                }

                const app = document.querySelector("#app");
                app.__vue_app__ = {};
                app.dataset.e2eHydrated = "true";
            };
            setTimeout(hydrate, ${JSON.stringify(hydrationDelayMs)});

            const bewlyDelayMs = ${JSON.stringify(bewlyDelayMs ?? null)};
            if (bewlyDelayMs !== null) {
                setTimeout(() => {
                    const host = document.createElement("div");
                    host.id = "bewly";
                    const root = host.attachShadow({ mode: "open" });
                    root.innerHTML = ${JSON.stringify(
                        `<div class="bewly-scroll-viewport">${createBewlyCardHtml(bewlyHomeBvid)}</div>`
                    )};
                    document.body.appendChild(host);
                }, bewlyDelayMs);
            }
        </script>
    </body>
</html>
    `;
}

export async function routeMockBilibiliHomePage(
    page: Page,
    options: MockBilibiliHomePageOptions = {}
): Promise<void> {
    await page.route("https://www.bilibili.com/", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: createMockHomePageHtml(options),
        });
    });
}

export async function replaceNativeHomeContainer(page: Page, bvid: string): Promise<void> {
    await page.evaluate(
        ({ nextBvid, cardHtml }) => {
            const oldContainer = document.querySelector(".recommended-container_floor-aside .container");
            const nextContainer = document.createElement("div");
            nextContainer.className = "container";
            nextContainer.innerHTML = cardHtml;
            oldContainer?.replaceWith(nextContainer);
            window["__BSB_E2E_REPLACEMENT_BVID__"] = nextBvid;
        },
        {
            nextBvid: bvid,
            cardHtml: createNativeCardHtml(bvid, "replacement"),
        }
    );
}
