import { ActionType, CategorySkipOption, SponsorTime } from "../../src/types";

/** 各 content 测试共享的 config 默认值，测试可通过 overrides 覆盖单项。 */
export const CONFIG_DEFAULTS = {
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
    skipNoticeDuration: 4,
    skipOnSeekToSegment: true,
    speedUpPlaybackRate: 4,
    trackViewCount: true,
    trackViewCountInPrivate: false,
    useVirtualTime: false,
};

export function installChromeMock(): void {
    (global as unknown as { chrome: typeof chrome }).chrome = {
        runtime: {
            getURL: jest.fn((path: string) => path),
        },
        extension: {
            inIncognitoContext: false,
        },
    } as unknown as typeof chrome;
}

export interface MakeVideoOptions {
    duration?: number;
    rate?: number;
    muted?: boolean;
}

export function makeVideo(options: MakeVideoOptions = {}): HTMLVideoElement {
    const v = document.createElement("video");
    Object.defineProperty(v, "duration", { configurable: true, value: options.duration ?? 200 });
    Object.defineProperty(v, "paused", { configurable: true, value: false });
    Object.defineProperty(v, "playbackRate", { configurable: true, writable: true, value: options.rate ?? 1 });
    Object.defineProperty(v, "muted", { configurable: true, writable: true, value: options.muted ?? false });
    v.currentTime = 0;
    return v;
}

export function makeSegment(uuid: string, start: number, end: number, actionType = ActionType.Skip): SponsorTime {
    return {
        UUID: uuid,
        segment: [start, end],
        category: "sponsor",
        actionType,
        source: 0,
    } as SponsorTime;
}

export interface CoreMockOptions {
    configOverrides?: Record<string, unknown>;
    asyncRequestToServerMock?: jest.Mock;
    /** getChannelIDInfo().status，默认 1（Resolved）。 */
    channelStatus?: number;
}

/**
 * 注册 content 链路依赖的通用模块 mock（config/requests/utils/video 等）。
 * 必须在 jest.resetModules() 之后、import src 模块之前调用。
 * 特殊 mock（如替换 speedUpManager 本身）请在本函数之后自行 jest.doMock 覆盖。
 */
export function installCoreModuleMocks(video: HTMLVideoElement, options: CoreMockOptions = {}): void {
    jest.doMock("../../src/config", () => ({
        __esModule: true,
        default: { config: { ...CONFIG_DEFAULTS, ...options.configOverrides } },
    }));
    jest.doMock("../../src/requests/requests", () => ({
        asyncRequestToServer: options.asyncRequestToServerMock ?? jest.fn(),
    }));
    jest.doMock("../../src/utils", () => ({
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
    jest.doMock("../../src/utils/logger", () => ({
        logDebug: jest.fn(),
        logUiLifecycle: jest.fn(),
    }));
    jest.doMock("../../src/utils/pageUtils", () => ({
        isPlayingPlaylist: jest.fn(() => false),
    }));
    jest.doMock("../../src/utils/parseVideoID", () => ({
        getBilibiliVideoID: jest.fn(async () => "BV1test"),
    }));
    jest.doMock("../../src/utils/urlParser", () => ({
        getStartTimeFromUrl: jest.fn(() => null),
    }));
    jest.doMock("../../src/utils/video", () => ({
        checkIfNewVideoID: jest.fn(async () => false),
        checkVideoIDChange: jest.fn(),
        getChannelIDInfo: jest.fn(() => ({ status: options.channelStatus ?? 1 })),
        getVideo: jest.fn(() => video),
        getVideoID: jest.fn(() => "BV1test"),
            getCid: jest.fn(() => "1"),
    }));
}

export interface ContentHarness {
    app: import("../../src/content/app").ContentApp;
    contentState: typeof import("../../src/content/state").contentState;
    CONTENT_EVENTS: typeof import("../../src/content/app/events").CONTENT_EVENTS;
}

/**
 * 一站式装配：createContentApp + 注册 ui/updateActiveSegment 空命令 + registerSkipScheduler + registerSpeedUpManager。
 * 前提：已 installCoreModuleMocks 且未替换 speedUpManager mock。
 */
export async function setupFullContent(): Promise<ContentHarness> {
    const { createContentApp } = await import("../../src/content/app");
    const { CONTENT_EVENTS } = await import("../../src/content/app/events");
    const { contentState } = await import("../../src/content/state");
    const { registerSkipScheduler } = await import("../../src/content/skipScheduler");
    const { registerSpeedUpManager } = await import("../../src/content/speedUpManager");

    const app = createContentApp();
    app.commands.register("ui/updateActiveSegment", () => undefined);
    registerSkipScheduler();
    registerSpeedUpManager();

    return { app, contentState, CONTENT_EVENTS };
}
