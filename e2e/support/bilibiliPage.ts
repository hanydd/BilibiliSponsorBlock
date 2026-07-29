import type { Page } from "@playwright/test";

const mockBilibiliVideoPageHtml = String.raw`
<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8" />
        <title>Mock Bilibili Video</title>
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
                display: block;
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
        </style>
    </head>
    <body>
        <div id="bilibili-player">
            <div class="bpx-player-container">
                <div class="bpx-player-video-area">
                    <div class="bpx-player-video-wrap">
                        <video></video>
                    </div>
                    <div class="bpx-player-progress">
                        <div class="bpx-player-progress-schedule"></div>
                    </div>
                    <div class="bpx-player-shadow-progress-area"></div>
                    <div class="bpx-player-control-bottom-left"></div>
                    <div class="bpx-player-control-bottom-right"></div>
                    <div class="bpx-player-ctrl-time-label">00:00 / 02:00</div>
                </div>
            </div>
        </div>

        <a class="up-name" href="/space/1">Mock UP</a>

        <script>
            const video = document.querySelector("video");
            Object.defineProperties(video, {
                duration: { configurable: true, value: 120 },
                currentTime: { configurable: true, writable: true, value: 15 },
                readyState: { configurable: true, value: HTMLMediaElement.HAVE_ENOUGH_DATA },
                paused: { configurable: true, value: false },
            });
            video.dispatchEvent(new Event("loadedmetadata"));
            video.dispatchEvent(new Event("canplay"));
        </script>
    </body>
</html>
`;

export async function routeMockBilibiliVideoPage(page: Page): Promise<void> {
    await page.route("https://www.bilibili.com/video/**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: mockBilibiliVideoPageHtml,
        });
    });
}
