/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://www.bilibili.com/video/BV1xx411c7mD/"}
 */

import { PageType } from "../src/types";

describe("video page type state", () => {
    let parsedVideoID: string | null;
    let parseVideoIDFromUrl: boolean;

    beforeEach(() => {
        jest.resetModules();
        window.history.replaceState(null, "", "https://www.bilibili.com/video/BV1xx411c7mD/");
        parsedVideoID = "BV1xx411c7mD+12345";
        parseVideoIDFromUrl = false;

        (global as unknown as { chrome: typeof chrome }).chrome = {
            runtime: {
                getManifest: jest.fn(() => ({ manifest_version: 3 })),
                id: "test-extension",
            },
        } as unknown as typeof chrome;

        jest.doMock("../dist/js/document.js", () => ({}));
        jest.doMock("../src/config", () => ({
            __esModule: true,
            default: {
                isReady: jest.fn(() => true),
                local: {},
                forceLocalUpdate: jest.fn(),
            },
        }));
        jest.doMock("../src/utils/parseVideoID", () => ({
            getBilibiliVideoID: jest.fn(async (url?: string) => {
                if (!parseVideoIDFromUrl) return parsedVideoID;

                const targetUrl = url ?? document.URL;
                return targetUrl.includes("/video/") ? "BV1xx411c7mD+12345" : null;
            }),
        }));
        jest.doMock("../src/utils/injectedScriptMessageUtils", () => ({
            getPropertyFromWindow: jest.fn(async ({ sendType }) => sendType === "getFrameRate" ? 30 : "123"),
        }));
        jest.doMock("../src/thumbnail-utils/thumbnailManagement", () => ({
            checkPageForNewThumbnails: jest.fn(),
        }));
        jest.doMock("../src/utils/dom", () => ({
            getElement: jest.fn(() => null),
            isVisible: jest.fn(() => false),
            waitForElement: jest.fn(() => new Promise(() => undefined)),
        }));
    });

    test("keeps video page type after a video ID change", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { checkVideoIDChange, detectPageType, getPageType } = await import("../src/utils/video");

        createContentApp();

        expect(detectPageType()).toBe(PageType.Video);

        await checkVideoIDChange();

        expect(getPageType()).toBe(PageType.Video);
    });

    test("keeps video context when video ID parsing temporarily fails on a video page", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { checkVideoIDChange, getPageType, getVideoID } = await import("../src/utils/video");

        createContentApp();

        await checkVideoIDChange();
        parsedVideoID = null;

        await checkVideoIDChange();

        expect(getPageType()).toBe(PageType.Video);
        expect(getVideoID()).toBe("BV1xx411c7mD+12345");
    });

    test("clears video context when routing away from a video page", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { checkVideoIDChange, getPageType, getVideoID } = await import("../src/utils/video");

        parseVideoIDFromUrl = true;
        createContentApp();

        await checkVideoIDChange();
        window.history.pushState(null, "", "https://www.bilibili.com/");

        await checkVideoIDChange();

        expect(getPageType()).toBe(PageType.Main);
        expect(getVideoID()).toBeNull();
    });

    test.each(["/", "/opus/1129722427782201345", "/?keyword=python"])(
        "does not wait for a player or request media properties when there is no player: %s", async path => {
            window.history.replaceState(null, "", `https://www.bilibili.com${path}`);
            // Inline card previews are also outside the main player's ownership.
            document.body.innerHTML = '<div class="v-recommend-inline-player"><video></video></div>';
            const { createContentApp } = await import("../src/content/app");
            const { getVideo } = await import("../src/utils/video");
            const { getPropertyFromWindow } = await import("../src/utils/injectedScriptMessageUtils");
            const { waitForElement } = await import("../src/utils/dom");
            createContentApp();
            try {
                expect(getVideo()).toBeNull();
                expect(getVideo()).toBeNull();
                expect(waitForElement).not.toHaveBeenCalled();
                expect(getPropertyFromWindow).not.toHaveBeenCalled();
            } finally {
                document.body.replaceChildren();
            }
        }
    );

    test("recovers after the whole player is replaced within the discovery throttle window", async () => {
        jest.useFakeTimers();
        parsedVideoID = null;
        jest.doMock("../src/utils/dom", () => ({
            getElement: jest.fn((selector: string) => document.querySelector(selector)),
            isVisible: jest.fn(() => true),
            waitForElement: jest.fn(async (selector: string) => document.querySelector(selector)),
        }));
        const { createContentApp } = await import("../src/content/app");
        const { getVideo } = await import("../src/utils/video");
        const { PlayerUiLifecycle } = await import("../src/content/playerUiLifecycle");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const app = createContentApp();
        const ready = jest.fn();
        const changes = jest.fn();
        const replacePlayer = () => {
            document.body.innerHTML = '<div id="bilibili-player"><div class="bpx-player-video-wrap"><video></video></div></div>';
            const next = document.querySelector("video");
            Object.defineProperties(next, { readyState: { value: 1 }, duration: { value: 120 } });
            return next;
        };
        const lifecycle = new PlayerUiLifecycle({
            capture: () => ({ video: getVideo(), pageLoaded: true, hidden: false,
                leftControls: null, rightControls: null, timeControl: null, progressBar: null }),
            isReady: ({ video }) => !!video?.isConnected,
            duration: () => 120, ready, invalidated: jest.fn(), timelineChanged: jest.fn(),
        });
        app.bus.on(CONTENT_EVENTS.VIDEO_ELEMENT_CHANGED, lifecycle.requestCheck);
        app.bus.on(CONTENT_EVENTS.VIDEO_ELEMENT_CHANGED, changes);
        try {
            replacePlayer();
            lifecycle.requestCheck();
            await jest.advanceTimersByTimeAsync(250);
            expect(ready).toHaveBeenCalledTimes(1);
            const replacement = replacePlayer();
            lifecycle.requestCheck();
            await jest.advanceTimersByTimeAsync(5000);
            expect(ready).toHaveBeenCalledTimes(2);
            expect(ready.mock.lastCall[0].video).toBe(replacement);
            // Discovery must also move its observer to the replacement wrapper.
            const next = replacement.cloneNode() as HTMLVideoElement;
            replacement.replaceWith(next);
            await jest.advanceTimersByTimeAsync(0);
            expect(changes).toHaveBeenLastCalledWith({ video: next }, expect.anything());
            expect(getVideo()).toBe(next);
        } finally {
            lifecycle.dispose();
            jest.clearAllTimers();
            jest.useRealTimers();
            document.body.replaceChildren();
        }
    });

    test("publishes identity changes for replacements and reused videos without rediscovering the same node", async () => {
        parsedVideoID = null;
        jest.doMock("../src/utils/dom", () => ({
            getElement: jest.fn(() => null),
            isVisible: jest.fn(() => true),
            waitForElement: jest.fn(async (selector: string) => document.querySelector(selector)),
        }));
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { getVideo } = await import("../src/utils/video");
        const app = createContentApp();
        const changes: Array<{ video: HTMLVideoElement | null }> = [];
        app.bus.on(CONTENT_EVENTS.VIDEO_ELEMENT_CHANGED, (event) => changes.push(event));

        document.body.innerHTML = '<div id="bilibili-player"></div>';
        const player = document.getElementById("bilibili-player");
        const first = document.createElement("video");
        const replacement = document.createElement("video");
        const clone = first.cloneNode() as HTMLVideoElement;
        try {
            for (const element of [first, first, replacement, first, clone]) {
                player.replaceChildren(element);
                getVideo();
                await new Promise((resolve) => setTimeout(resolve, 0));
                expect(getVideo()).toBe(element);
            }

            expect(changes).toEqual([
                { video: first },
                { video: replacement },
                { video: first },
                { video: clone },
            ]);
        } finally {
            document.body.innerHTML = "";
        }
    });
    test.each([false, true])("ignores a preparing replacement until handoff (abort=%s)", async abort => {
        jest.doMock("../src/utils/dom", () => ({
            getElement: jest.fn(() => null),
            isVisible: jest.fn(() => false),
            waitForElement: jest.fn(async (selector: string) => document.querySelector(selector)),
        }));
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { getVideo, checkVideoIDChange } = await import("../src/utils/video");
        const app = createContentApp();
        const changes = jest.fn();
        const resets = jest.fn();
        app.bus.on(CONTENT_EVENTS.VIDEO_ELEMENT_CHANGED, changes);
        app.bus.on(CONTENT_EVENTS.VIDEO_RESET_REQUESTED, resets);
        document.body.innerHTML = '<div id="bilibili-player"><video></video></div>';
        const old = document.querySelector('video');
        const replacement = document.createElement('video');
        replacement.className = 'bpx-player-seamless-replacement';
        const refresh = async () => {
            getVideo();
            await new Promise(resolve => setTimeout(resolve, 0));
        };
        try {
            await refresh();
            expect(getVideo()).toBe(old);
            changes.mockClear(); resets.mockClear();
            old.before(replacement);
            await refresh();
            expect(getVideo()).toBe(old);
            expect(changes).not.toHaveBeenCalled();
            // Visibility changes are not a new video identity.
            await checkVideoIDChange();
            expect(resets).not.toHaveBeenCalled();
            if (abort) replacement.remove();
            else {
                replacement.classList.remove('bpx-player-seamless-replacement');
                old.remove();
            }
            await refresh();
            expect(getVideo()).toBe(abort ? old : replacement);
            expect(changes).toHaveBeenCalledTimes(abort ? 0 : 1);
            expect(resets).not.toHaveBeenCalled();
        } finally {
            document.body.innerHTML = '';
        }
    });

});
