import type { Page } from "@playwright/test";

export type MockBilibiliPageOptions = {
    bvid?: string;
    cid?: string;
    channelId?: string;
    channelName?: string;
    currentTime?: number;
    paused?: boolean;
    vueHydrationDelayMs?: number;
    replacePlayerControlsOnHydration?: boolean;
};

export const defaultMockBvid = "BV1JfLg6qEtf";
export const defaultMockCid = "123456";
export const defaultMockChannelId = "987654";

const mockVideoUrl = "https://www.bilibili.com/e2e/mock-video.webm";
const mockVideoBody = Buffer.from(
    "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAIpEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggIA7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjIuMy4xMDBXQYxMYXZmNjIuMy4xMDBEiYhA/UwAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WIxJJi81muWYOcgQAitZyDdW5kiIEAhoVWX1ZQOYOBASPjg4Q7msoA4JCwgRC6gRCagQJVsIRVuYEBElTDZ0B/c3OfY8CAZ8iZRaOHRU5DT0RFUkSHjExhdmY2Mi4zLjEwMHNz2mPAi2PFiMSSYvNZrlmDZ8ilRaOHRU5DT0RFUkSHmExhdmM2Mi4xMS4xMDAgbGlidnB4LXZwOWfIoUWjiERVUkFUSU9ORIeTMDA6MDI6MDAuMDAwMDAwMDAwAB9DtnWm54EAo6GBAACAgkmDQgAA8AD2ADgkHBhCAAAwYAAAEL///YsqAAAfQ7Z1qOeDAdDYo6GBAACAgkmDQgAA8AD2ADgkHBhCAAAwYAAAEL///YsqAAAcU7trpLuPs4EAt4r3gQHxggGo8IEDu5GzgwHQ2LeK94EB8YIB0/CBBQ==",
    "base64"
);

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function createMockBilibiliVideoPageHtml(options: MockBilibiliPageOptions): string {
    const bvid = options.bvid ?? defaultMockBvid;
    const cid = options.cid ?? defaultMockCid;
    const channelId = options.channelId ?? defaultMockChannelId;
    const channelName = options.channelName ?? "Mock UP";
    const currentTime = options.currentTime ?? 15;
    const paused = options.paused ?? true;
    const vueHydrationDelayMs = options.vueHydrationDelayMs ?? 0;
    const replacePlayerControlsOnHydration = options.replacePlayerControlsOnHydration ?? false;

    return String.raw`
<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8" />
        <title>Mock Bilibili Video</title>
        <script>
            window.__INITIAL_STATE__ = {
                aid: 1,
                bvid: ${JSON.stringify(bvid)},
                cid: ${JSON.stringify(cid)},
                upData: { mid: ${JSON.stringify(channelId)} },
                videoData: { desc: "Mock video description" },
            };
            window.player = {
                getManifest: () => ({
                    aid: 1,
                    bvid: ${JSON.stringify(bvid)},
                    cid: ${JSON.stringify(cid)},
                    p: 1,
                }),
            };
        </script>
        <style>
            html,
            body {
                margin: 0;
                width: 100%;
                height: 100%;
            }

            #bilibili-player {
                width: 960px;
                height: 540px;
                position: relative;
                background: #111;
            }

            .bpx-player-container,
            .bpx-player-video-area,
            .bpx-player-video-wrap {
                width: 100%;
                height: 100%;
                position: relative;
            }

            video {
                display: block;
                width: 960px;
                height: 540px;
            }

            .bpx-player-control-bottom-left,
            .bpx-player-control-bottom-right,
            .bpx-player-progress,
            .bpx-player-progress-schedule,
            .bpx-player-shadow-progress-area {
                position: absolute;
                display: flex;
                height: 24px;
                min-width: 120px;
                background: rgba(255, 255, 255, 0.2);
            }

            .bpx-player-control-bottom-left {
                left: 16px;
                bottom: 16px;
            }

            .bpx-player-control-bottom-right {
                right: 16px;
                bottom: 16px;
            }

            .bpx-player-progress,
            .bpx-player-progress-schedule,
            .bpx-player-shadow-progress-area {
                left: 16px;
                right: 16px;
                bottom: 52px;
                width: 928px;
            }

            #danmukuBox {
                width: 374px;
            }
        </style>
    </head>
    <body>
        <div id="app"></div>
        <div id="danmukuBox"></div>

        <div id="bilibili-player">
            <div class="bpx-player-container">
                <div class="bpx-player-video-area">
                    <div class="bpx-player-video-wrap">
                        <video src="${mockVideoUrl}" muted playsinline></video>
                    </div>
                    <div class="bpx-player-progress">
                        <div class="bpx-player-progress-schedule"></div>
                    </div>
                    <div class="bpx-player-shadow-progress-area"></div>
                    <div class="bpx-player-control-bottom-left">
                        <button class="bpx-player-ctrl-btn bpx-player-ctrl-play" aria-label="播放/暂停"></button>
                        <div class="bpx-player-ctrl-btn bpx-player-ctrl-time">00:00 / 02:00</div>
                    </div>
                    <div class="bpx-player-control-bottom-right" data-e2e-generation="ssr">
                        <button>1</button>
                        <button>2</button>
                        <button>3</button>
                        <button>4</button>
                        <button>5</button>
                    </div>
                </div>
            </div>
        </div>

        <a class="up-name" href="/space/${escapeHtml(channelId)}">${escapeHtml(channelName)}</a>

        <script>
            const video = document.querySelector("video");

            const hydrateVueApp = () => {
                if (${JSON.stringify(replacePlayerControlsOnHydration)}) {
                    const controls = document.querySelector(".bpx-player-control-bottom-right");
                    controls.replaceChildren(
                        ...Array.from({ length: 5 }, (_, index) => {
                            const button = document.createElement("button");
                            button.textContent = String(index + 1);
                            return button;
                        })
                    );
                    controls.dataset.e2eGeneration = "hydrated";
                }

                const app = document.querySelector("#app");
                app.__vue_app__ = {};
                app.dataset.e2eHydrated = "true";
                app.dataset.e2eHydratedAt = String(performance.now());
                video.dispatchEvent(new Event("mouseover"));
            };

            const initializeVideo = () => {
                video.currentTime = ${JSON.stringify(currentTime)};
                if (!${JSON.stringify(paused)}) {
                    void video.play();
                }
            };

            if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
                initializeVideo();
            } else {
                video.addEventListener("loadedmetadata", initializeVideo, { once: true });
            }

            setTimeout(hydrateVueApp, ${JSON.stringify(vueHydrationDelayMs)});
        </script>
    </body>
</html>
`;
}

export async function routeMockBilibiliVideoPage(
    page: Page,
    options: MockBilibiliPageOptions = {}
): Promise<void> {
    await page.route(mockVideoUrl, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "video/webm",
            headers: {
                "accept-ranges": "bytes",
            },
            body: mockVideoBody,
        });
    });

    await page.route("https://www.bilibili.com/video/**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: createMockBilibiliVideoPageHtml(options),
        });
    });
}

export async function setMockVideoTime(page: Page, time: number, dispatchSeeking = false): Promise<void> {
    await page.locator("#bilibili-player video").evaluate(
        (video: HTMLVideoElement, values: { time: number; dispatchSeeking: boolean }) => {
            video.currentTime = values.time;
            if (values.dispatchSeeking) {
                video.dispatchEvent(new Event("seeking"));
            }
        },
        { time, dispatchSeeking }
    );
}

export async function getMockVideoTime(page: Page): Promise<number> {
    return await page.locator("#bilibili-player video").evaluate((video: HTMLVideoElement) => video.currentTime);
}

export async function pauseMockVideo(page: Page): Promise<void> {
    await page.locator("#bilibili-player video").evaluate((video: HTMLVideoElement) => video.pause());
}
