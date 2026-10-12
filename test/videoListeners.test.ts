/** @jest-environment jsdom */

describe("video listeners", () => {
    function installConfigMock(disableSkipping: boolean): void {
        jest.doMock("../src/config", () => ({
            __esModule: true,
            default: {
                config: {
                    disableSkipping,
                },
            },
        }));
    }

    beforeEach(() => {
        jest.resetModules();
        installConfigMock(true);
        jest.doMock("../src/content/danmakuSkip", () => ({
            danmakuForSkip: jest.fn(),
        }));
        jest.doMock("../src/utils/logger", () => ({
            logDebug: jest.fn(),
        }));
        jest.doMock("../src/utils/video", () => ({
            getVideoID: jest.fn(() => "BV1test"),
            getVideo: jest.fn(() => document.querySelector("video")),
        }));
    });

    test("video ready and duration changes only emit player events", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { durationChangeListener, videoOnReadyListener } = await import("../src/content/videoListeners");
        const app = createContentApp();
        const video = document.createElement("video");
        const emitted: string[] = [];

        app.bus.on(CONTENT_EVENTS.PLAYER_VIDEO_READY, ({ video: eventVideo }) => {
            expect(eventVideo).toBe(video);
            emitted.push(CONTENT_EVENTS.PLAYER_VIDEO_READY);
        });
        app.bus.on(CONTENT_EVENTS.PLAYER_DURATION_CHANGED, ({ video: eventVideo }) => {
            expect(eventVideo).toBe(video);
            emitted.push(CONTENT_EVENTS.PLAYER_DURATION_CHANGED);
        });

        expect(() => videoOnReadyListener({ target: video } as unknown as Event)).not.toThrow();
        expect(() => durationChangeListener({ target: video } as unknown as Event)).not.toThrow();
        expect(emitted).toEqual([
            CONTENT_EVENTS.PLAYER_VIDEO_READY,
            CONTENT_EVENTS.PLAYER_DURATION_CHANGED,
        ]);
    });

    test("binds synchronously after config bootstrap so immediate metadata is not missed", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { registerVideoListeners } = await import("../src/content/videoListeners");
        const app = createContentApp();
        const video = document.createElement("video");
        document.body.append(video);
        const ready = jest.fn();
        app.bus.on(CONTENT_EVENTS.PLAYER_VIDEO_READY, ready);
        registerVideoListeners();
        try {
            app.bus.emit(CONTENT_EVENTS.VIDEO_ELEMENT_CHANGED, { video });
            video.dispatchEvent(new Event("loadedmetadata"));
            expect(ready).toHaveBeenCalledTimes(1);
        } finally {
            app.bus.emit(CONTENT_EVENTS.VIDEO_ELEMENT_CHANGED, { video: null });
            video.remove();
        }
    });

    test("playback event callbacks emit facts without skip command handlers", async () => {
        jest.resetModules();
        installConfigMock(false);
        jest.doMock("../src/content/danmakuSkip", () => ({
            danmakuForSkip: jest.fn(),
        }));
        jest.doMock("../src/utils/logger", () => ({
            logDebug: jest.fn(),
        }));
        jest.doMock("../src/utils/video", () => ({
            getVideoID: jest.fn(() => "BV1test"),
        }));

        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { setupVideoListeners } = await import("../src/content/videoListeners");
        const app = createContentApp();
        const video = document.createElement("video");
        const emitted: string[] = [];

        for (const eventName of [
            CONTENT_EVENTS.PLAYER_RATE_CHANGED,
            CONTENT_EVENTS.PLAYER_PLAY,
            CONTENT_EVENTS.PLAYER_PLAYING,
            CONTENT_EVENTS.PLAYER_SEEKING,
            CONTENT_EVENTS.PLAYER_PAUSE,
            CONTENT_EVENTS.PLAYER_WAITING,
        ]) {
            app.bus.on(eventName, () => {
                emitted.push(eventName);
            });
        }

        const unregisterInitialSchedule = app.commands.register("skip/startSchedule", () => undefined);
        setupVideoListeners(video);
        unregisterInitialSchedule();

        Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_ENOUGH_DATA });
        Object.defineProperty(video, "paused", { configurable: true, value: false });
        video.currentTime = 5;

        expect(() => {
            video.dispatchEvent(new Event("ratechange"));
            video.dispatchEvent(new Event("play"));
            video.dispatchEvent(new Event("playing"));
            video.dispatchEvent(new Event("seeking"));
            video.dispatchEvent(new Event("pause"));
            video.dispatchEvent(new Event("waiting"));
        }).not.toThrow();

        expect(emitted).toEqual([
            CONTENT_EVENTS.PLAYER_RATE_CHANGED,
            CONTENT_EVENTS.PLAYER_PLAY,
            CONTENT_EVENTS.PLAYER_PLAYING,
            CONTENT_EVENTS.PLAYER_SEEKING,
            CONTENT_EVENTS.PLAYER_PAUSE,
            CONTENT_EVENTS.PLAYER_WAITING,
        ]);
    });

    test("emits media readiness again when the same video element loads another source", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { setupVideoListeners } = await import("../src/content/videoListeners");
        const app = createContentApp();
        const video = document.createElement("video");
        const ready = jest.fn();
        app.bus.on(CONTENT_EVENTS.PLAYER_VIDEO_READY, ready);
        setupVideoListeners(video);
        video.dispatchEvent(new Event("loadedmetadata"));
        video.dispatchEvent(new Event("loadedmetadata"));
        expect(ready).toHaveBeenCalledTimes(2);
        expect(ready.mock.calls[1][0].video).toBe(video);
    });
    test("unbinds replaced media and avoids duplicate listeners on retained video", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { setupVideoListeners } = await import("../src/content/videoListeners");
        const app = createContentApp();
        const oldVideo = document.createElement("video"), newVideo = document.createElement("video");
        const ready = jest.fn();
        app.bus.on(CONTENT_EVENTS.PLAYER_VIDEO_READY, ready);
        setupVideoListeners(oldVideo);
        setupVideoListeners(newVideo);
        setupVideoListeners(newVideo);
        oldVideo.dispatchEvent(new Event("loadedmetadata"));
        expect(ready).not.toHaveBeenCalled();
        newVideo.dispatchEvent(new Event("loadedmetadata"));
        expect(ready).toHaveBeenCalledTimes(1);
        expect(ready.mock.calls[0][0].video).toBe(newVideo);
    });

});
