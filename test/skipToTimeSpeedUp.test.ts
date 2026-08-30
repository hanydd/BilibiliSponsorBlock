/** @jest-environment jsdom */

import { ActionType, CategorySkipOption, SponsorTime } from "../src/types";

describe("skipToTime speedUp delegation", () => {
    let video: HTMLVideoElement;
    let startSpeedUpMock: jest.Mock;
    let shouldUseSpeedUpMock: jest.Mock;
    let asyncRequestToServerMock: jest.Mock;

    function installChromeMock(): void {
        (global as unknown as { chrome: typeof chrome }).chrome = {
            runtime: {
                getURL: jest.fn((path: string) => path),
            },
            extension: {
                inIncognitoContext: false,
            },
        } as unknown as typeof chrome;
    }

    function installModuleMocks(): void {
        jest.doMock("../src/config", () => ({
            __esModule: true,
            default: {
                config: {
                    audioNotificationOnSkip: false,
                    autoSkipOnMusicVideos: false,
                    disableSkipping: false,
                    dontShowNotice: false,
                    enableAutoSkipDanmakuSkip: false,
                    enableSpeedUp: true,
                    forceChannelCheck: false,
                    manualSkipOnFullVideo: false,
                    minutesSaved: 0,
                    skipCount: 0,
                    skipOnSeekToSegment: true,
                    speedUpPlaybackRate: 2,
                    trackViewCount: true,
                    trackViewCountInPrivate: false,
                    useVirtualTime: false,
                },
            },
        }));
        jest.doMock("../src/requests/requests", () => ({
            asyncRequestToServer: asyncRequestToServerMock,
        }));
        jest.doMock("../src/utils", () => ({
            __esModule: true,
            default: jest.fn().mockImplementation(() => ({
                getCategorySelection: jest.fn(() => ({ option: CategorySkipOption.AutoSkip })),
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
            getBilibiliVideoID: jest.fn(),
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
        jest.doMock("../src/content/speedUpManager", () => ({
            cancelSpeedUp: jest.fn(),
            getSpeedUpOriginalRate: jest.fn(() => 1),
            isSpeedUpActive: jest.fn(() => false),
            shouldUseSpeedUp: shouldUseSpeedUpMock,
            startSpeedUp: startSpeedUpMock,
        }));
    }

    beforeEach(() => {
        jest.resetModules();
        startSpeedUpMock = jest.fn(async () => true);
        shouldUseSpeedUpMock = jest.fn(() => false);
        asyncRequestToServerMock = jest.fn();
        installChromeMock();
        installModuleMocks();
        video = document.createElement("video");
        Object.defineProperty(video, "duration", { configurable: true, value: 100 });
        Object.defineProperty(video, "paused", { configurable: true, value: false });
        Object.defineProperty(video, "playbackRate", { configurable: true, writable: true, value: 1 });
        video.currentTime = 5;
    });

    function makeSegment(): SponsorTime {
        return {
            UUID: "uuid-1",
            segment: [10, 20],
            category: "sponsor",
            actionType: ActionType.Skip,
            source: 0,
        } as SponsorTime;
    }

    test("delegates to speedUp without seeking and emits manual notice + executed", async () => {
        shouldUseSpeedUpMock.mockReturnValue(true);
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { skipToTime } = await import("../src/content/skipScheduler");
        const app = createContentApp();

        const notices: Array<{ autoSkip: boolean }> = [];
        const executed: Array<{ autoSkip: boolean }> = [];
        app.bus.on(CONTENT_EVENTS.SKIP_NOTICE_REQUESTED, (payload) => {
            notices.push({ autoSkip: payload.autoSkip });
        });
        app.bus.on(CONTENT_EVENTS.SKIP_EXECUTED, (payload) => {
            executed.push({ autoSkip: payload.autoSkip });
        });

        const segment = makeSegment();
        skipToTime({
            v: video,
            skipTime: [10, 20],
            skippingSegments: [segment],
            openNotice: true,
        });

        expect(startSpeedUpMock).toHaveBeenCalledWith([segment], [10, 20], 1);
        expect(video.currentTime).toBe(5); // no seek during speedUp
        expect(notices).toEqual([{ autoSkip: false }]); // manual-style notice
        expect(executed).toEqual([{ autoSkip: true }]);
        expect(asyncRequestToServerMock).not.toHaveBeenCalled(); // no telemetry
    });

    test("falls back to instant skip when speedUp is not used", async () => {
        shouldUseSpeedUpMock.mockReturnValue(false);
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { contentState } = await import("../src/content/state");
        const { skipToTime } = await import("../src/content/skipScheduler");
        const app = createContentApp();

        const segment = makeSegment();
        contentState.sponsorTimes = [segment];

        const executed: Array<{ autoSkip: boolean }> = [];
        app.bus.on(CONTENT_EVENTS.SKIP_EXECUTED, (payload) => {
            executed.push({ autoSkip: payload.autoSkip });
        });

        skipToTime({
            v: video,
            skipTime: [10, 20],
            skippingSegments: [segment],
            openNotice: true,
        });

        expect(startSpeedUpMock).not.toHaveBeenCalled();
        expect(video.currentTime).toBe(20); // seeked to segment end
        expect(executed).toEqual([{ autoSkip: true }]);
        expect(asyncRequestToServerMock).toHaveBeenCalledWith("POST", "/api/viewedVideoSponsorTime?UUID=uuid-1");
    });

    test("plays beep when audioNotificationOnSkip is enabled during speedUp", async () => {
        shouldUseSpeedUpMock.mockReturnValue(true);
        const audioMock = jest.fn(() => ({
            volume: 0,
            play: jest.fn(),
            addEventListener: jest.fn(),
            remove: jest.fn(),
        }));
        (global as unknown as { Audio: unknown }).Audio = audioMock;
        try {
            Object.defineProperty(navigator, "mediaSession", {
                configurable: true,
                value: { metadata: null },
            });
        } catch {
            // jsdom may already define mediaSession as non-configurable; beep test still works
        }

        const { createContentApp } = await import("../src/content/app");
        const { skipToTime } = await import("../src/content/skipScheduler");
        const app = createContentApp();

        const config = (await import("../src/config")).default;
        config.config.audioNotificationOnSkip = true;

        const segment = makeSegment();
        skipToTime({
            v: video,
            skipTime: [10, 20],
            skippingSegments: [segment],
            openNotice: false,
        });

        expect(audioMock).toHaveBeenCalled();
    });
});