/** @jest-environment jsdom */
import { ActionType, SponsorTime } from "../src/types";

describe("skip scheduler player events", () => {
    let video: HTMLVideoElement;

    function installModuleMocks(): void {
        jest.doMock("../src/config", () => ({
            __esModule: true,
            default: {
                config: {
                    audioNotificationOnSkip: false,
                    disableSkipping: false,
                    forceChannelCheck: false,
                    manualSkipOnFullVideo: false,
                    showTimeWithSkips: false,
                    skipOnSeekToSegment: true,
                    trackViewCount: false,
                    trackViewCountInPrivate: false,
                    useVirtualTime: false,
                },
            },
        }));
        jest.doMock("../src/requests/requests", () => ({
            asyncRequestToServer: jest.fn(),
        }));
        jest.doMock("../src/utils", () => ({
            __esModule: true,
            default: jest.fn().mockImplementation(() => ({
                getCategorySelection: jest.fn(() => undefined),
                getTimestampsDuration: jest.fn(() => 0),
            })),
            isFirefox: jest.fn(() => false),
            isFirefoxOrSafari: jest.fn(() => false),
            isSafari: jest.fn(() => false),
            waitFor: jest.fn(),
        }));
        jest.doMock("../src/utils/logger", () => ({
            logDebug: jest.fn(),
            logUiLifecycle: jest.fn(),
        }));
        jest.doMock("../src/utils/pageUtils", () => ({
            isPlayingPlaylist: jest.fn(() => false),
        }));
        jest.doMock("../src/utils/parseVideoID", () => ({
            getBilibiliVideoID: jest.fn(async () => "BV1test"),
        }));
        jest.doMock("../src/utils/urlParser", () => ({
            getStartTimeFromUrl: jest.fn(() => null),
        }));
        jest.doMock("../src/utils/video", () => ({
            checkIfNewVideoID: jest.fn(async () => false),
            checkVideoIDChange: jest.fn(),
            getChannelIDInfo: jest.fn(() => ({ status: 0 })),
            getVideo: jest.fn(() => video),
            getVideoID: jest.fn(() => "BV1test"),
        }));
    }

    beforeEach(() => {
        jest.resetModules();
        video = document.createElement("video");
        Object.defineProperty(video, "duration", { configurable: true, value: 100 });
        Object.defineProperty(video, "paused", { configurable: true, value: false });
        Object.defineProperty(video, "playbackRate", { configurable: true, value: 1 });
        video.currentTime = 5;
        installModuleMocks();
    });

    test("rate changes and active seeking rebuild schedule through scheduler subscriptions", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { registerSkipScheduler } = await import("../src/content/skipScheduler");
        const app = createContentApp();
        const activeSegmentUpdates: number[] = [];

        app.commands.register("ui/updateActiveSegment", ({ currentTime }) => {
            activeSegmentUpdates.push(currentTime);
        });
        registerSkipScheduler();

        app.bus.emit(CONTENT_EVENTS.PLAYER_RATE_CHANGED, { video, playbackRate: 1 }, { source: "test" });
        await Promise.resolve();
        await Promise.resolve();

        app.bus.emit(CONTENT_EVENTS.PLAYER_SEEKING, { video }, { source: "test" });
        await Promise.resolve();
        await Promise.resolve();

        expect(activeSegmentUpdates).toEqual([5, 5]);
    });

    test("paused seeking updates active segment without rebuilding schedule", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { registerSkipScheduler } = await import("../src/content/skipScheduler");
        const app = createContentApp();
        const activeSegmentUpdates: number[] = [];

        app.commands.register("ui/updateActiveSegment", ({ currentTime }) => {
            activeSegmentUpdates.push(currentTime);
        });
        registerSkipScheduler();

        Object.defineProperty(video, "paused", { configurable: true, value: true });
        video.currentTime = 0;

        app.bus.emit(CONTENT_EVENTS.PLAYER_SEEKING, { video }, { source: "test" });
        await Promise.resolve();
        await Promise.resolve();

        expect(activeSegmentUpdates).toEqual([0]);
    });

    test("pause and waiting reset last-known playback timing", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { getLastKnownVideoTime, registerSkipScheduler } = await import("../src/content/skipScheduler");
        const app = createContentApp();

        app.commands.register("ui/updateActiveSegment", () => undefined);
        registerSkipScheduler();

        app.bus.emit(CONTENT_EVENTS.PLAYER_PLAY, { video }, { source: "test" });
        expect(getLastKnownVideoTime().videoTime).toBe(5);

        app.bus.emit(CONTENT_EVENTS.PLAYER_PAUSE, { video }, { source: "test" });
        expect(getLastKnownVideoTime()).toMatchObject({
            videoTime: null,
            preciseTime: null,
            fromPause: true,
        });

        app.bus.emit(CONTENT_EVENTS.PLAYER_PLAY, { video }, { source: "test" });
        expect(getLastKnownVideoTime().videoTime).toBe(5);

        app.bus.emit(CONTENT_EVENTS.PLAYER_WAITING, { video }, { source: "test" });
        expect(getLastKnownVideoTime()).toMatchObject({
            videoTime: null,
            preciseTime: null,
        });
    });

    test("seek into segment 意图在缓冲重启后不丢失", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { contentState } = await import("../src/content/state");
        const { registerSkipScheduler } = await import("../src/content/skipScheduler");
        const app = createContentApp();
        const notices: Array<{ autoSkip: boolean }> = [];

        app.commands.register("ui/updateActiveSegment", () => undefined);
        registerSkipScheduler();
        app.bus.on(CONTENT_EVENTS.SKIP_NOTICE_REQUESTED, (payload) => notices.push({ autoSkip: payload.autoSkip }));

        contentState.sponsorTimes = [{
            segment: [5, 20],
            UUID: "uuid-seek-in-segment",
            category: "sponsor",
            actionType: ActionType.Skip,
            source: 0,
        } as SponsorTime];
        video.currentTime = 6;

        // seek 进段内（登记 intersecting 意图）→ 缓冲打断调度 → PLAYING 重启（不带 intersecting）。
        // 意图须被继承：否则代际机制作废 seek 调度后，段内跳过/notice 永远不会发生（e2e 回归）。
        app.bus.emit(CONTENT_EVENTS.PLAYER_SEEKING, { video }, { source: "test" });
        app.bus.emit(CONTENT_EVENTS.PLAYER_WAITING, { video }, { source: "test" });
        app.bus.emit(CONTENT_EVENTS.PLAYER_PLAYING, { video }, { source: "test" });
        for (let i = 0; i < 12; i++) {
            await Promise.resolve();
        }

        expect(notices).toEqual([{ autoSkip: false }]);
        expect(video.currentTime).toBe(6); // 手动跳过类别不 seek，仅弹 notice
    });
});
