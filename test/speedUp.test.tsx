/** @jest-environment jsdom */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionType, SponsorTime } from "../src/types";
import { installChromeMock, installCoreModuleMocks, makeSegment, makeVideo, setupFullContent } from "./helpers/contentHarness";

/** 透传 firstColumn 的哑 StackNoticeComponent，便于断言倍速控制按钮渲染。 */
jest.mock("../src/components/StackNoticeComponent", () => ({
    __esModule: true,
    default: class MockStackNoticeComponent extends React.Component {
        render(): React.ReactElement {
            const props = this.props as unknown as { firstColumn: React.ReactNode; bottomRow: React.ReactNode; noticeTitle: string };
            return React.createElement("div", { className: "mock-notice" }, props.noticeTitle, props.firstColumn, props.bottomRow);
        }
    },
}));

describe("speedUp 核心行为与交互契约", () => {
    let video: HTMLVideoElement;
    let asyncRequestToServerMock: jest.Mock;

    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers();
        asyncRequestToServerMock = jest.fn();
        installChromeMock();
        video = makeVideo();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("replaying a completed speed-up shows its notice again without counting twice", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock });
        const { app, contentState, CONTENT_EVENTS } = await setupFullContent();
        const { skipToTime } = await import("../src/content/skipScheduler");
        const { isSpeedUpActive } = await import("../src/content/speedUpManager");
        const config = (await import("../src/config")).default;
        const segment = makeSegment("replay-notice", 40, 48);
        contentState.sponsorTimes = [segment];
        const notices: unknown[] = [];
        app.bus.on(CONTENT_EVENTS.SKIP_NOTICE_REQUESTED, payload => notices.push(payload));
        video.currentTime = 40;
        skipToTime({ v: video, skipTime: [40, 48], skippingSegments: [segment], openNotice: true });
        expect(isSpeedUpActive()).toBe(true);
        video.currentTime = 48;
        await jest.advanceTimersByTimeAsync(200);
        expect(notices).toHaveLength(2);
        expect(config.config.skipCount).toBe(1);
        Object.defineProperty(video, "paused", { configurable: true, value: true });
        video.currentTime = 39;
        app.bus.emit(CONTENT_EVENTS.PLAYER_SEEKING, { video }, { source: "test.userReplay" });
        Object.defineProperty(video, "paused", { configurable: true, value: false });
        video.currentTime = 40;
        skipToTime({ v: video, skipTime: [40, 48], skippingSegments: [segment], openNotice: true });
        expect(isSpeedUpActive()).toBe(true);
        expect(notices).toHaveLength(3);
        video.currentTime = 48;
        await jest.advanceTimersByTimeAsync(200);
        expect(config.config.skipCount).toBe(1);
    });

    test("连续快进在各段边界更新各自卡片，不中断倍速", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock });
        const { app, contentState, CONTENT_EVENTS } = await setupFullContent();
        const { startSpeedUp, resetSpeedUpState } = await import("../src/content/speedUpManager");
        const segments = [makeSegment("first", 0, 8.133), makeSegment("second", 8.133, 20.566)];
        contentState.sponsorTimes = segments;
        const states: Array<[string, boolean]> = [];
        app.bus.on(CONTENT_EVENTS.SKIP_NOTICE_REQUESTED, payload => {
            states.push([payload.skippingSegments[0].UUID, payload.autoSkip]);
        });
        video.currentTime = 0.2;
        await startSpeedUp(segments, [0, 20.566]);
        expect(states).toEqual([["first", false]]);
        video.currentTime = 8.133;
        await jest.advanceTimersByTimeAsync(100);
        expect(states).toEqual([["first", false], ["first", true], ["second", false]]);
        expect(video.playbackRate).toBe(4);
        await jest.advanceTimersByTimeAsync(500);
        expect(states).toHaveLength(3);
        video.currentTime = 20.566;
        await jest.advanceTimersByTimeAsync(100);
        expect(states[3]).toEqual(["second", true]);
        expect(video.playbackRate).toBe(1);
        resetSpeedUpState();
    });

    test("近尾不启动快进，不残留高倍速", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock });
        const { registerSpeedUpManager, startSpeedUp, isSpeedUpActive } = await import("../src/content/speedUpManager");
        const { createContentApp } = await import("../src/content/app");
        createContentApp();
        registerSpeedUpManager();

        video.playbackRate = 0.1;
        video.currentTime = 99.96; // 距 100 结尾 0.04s < epsilon
        const seg = makeSegment("uuid-p1-1", 60, 100);
        const ok = await startSpeedUp([seg], [60, 100], 0.1);
        expect(ok).toBe(false);
        expect(isSpeedUpActive()).toBe(false);
        expect(video.playbackRate).toBe(0.1);
    });

    test("配置倍速低于用户倍速时不降速", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock, configOverrides: { speedUpPlaybackRate: 2 } });
        const { registerSpeedUpManager, startSpeedUp, getActiveSpeedUpInfo } = await import("../src/content/speedUpManager");
        const { createContentApp } = await import("../src/content/app");
        createContentApp();
        registerSpeedUpManager();

        video.playbackRate = 3;
        video.currentTime = 40;
        const seg = makeSegment("uuid-p2-7", 40, 80);
        const ok = await startSpeedUp([seg], [40, 80], 3);
        expect(ok).toBe(true);
        expect(video.playbackRate).toBe(3); // max(2, 3)
        expect(getActiveSpeedUpInfo()?.rate).toBe(3);
    });

    test("当前倍速与设置倍速相同时叠加快进（2+2=4）", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock, configOverrides: { speedUpPlaybackRate: 2 } });
        const { registerSpeedUpManager, startSpeedUp, getActiveSpeedUpInfo } = await import("../src/content/speedUpManager");
        const { createContentApp } = await import("../src/content/app");
        createContentApp();
        registerSpeedUpManager();

        video.playbackRate = 2;
        video.currentTime = 40;
        const seg = makeSegment("uuid-stack-1", 40, 80);
        // 不传 forced rate，覆盖 video.playbackRate 读取路径
        const ok = await startSpeedUp([seg], [40, 80]);
        expect(ok).toBe(true);
        expect(video.playbackRate).toBe(4); // 2 + 2
        expect(getActiveSpeedUpInfo()?.rate).toBe(4);

        // 完成后恢复的仍是叠加前的原始倍速 2x
        video.currentTime = 80;
        await jest.advanceTimersByTimeAsync(150);
        expect(video.playbackRate).toBe(2);
    });

    test("当前倍速与设置倍速接近但不等时不叠加", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock, configOverrides: { speedUpPlaybackRate: 2 } });
        const { registerSpeedUpManager, startSpeedUp, getActiveSpeedUpInfo } = await import("../src/content/speedUpManager");
        const { createContentApp } = await import("../src/content/app");
        createContentApp();
        registerSpeedUpManager();

        video.playbackRate = 1.9; // |1.9 - 2| = 0.1 > 0.05 容差
        video.currentTime = 40;
        const seg = makeSegment("uuid-stack-2", 40, 80);
        // 不传 forced rate，覆盖 video.playbackRate 读取路径
        const ok = await startSpeedUp([seg], [40, 80]);
        expect(ok).toBe(true);
        expect(video.playbackRate).toBe(2); // max(2, 1.9)
        expect(getActiveSpeedUpInfo()?.rate).toBe(2);
    });

    test("链式快进以会话原速为基准：不叠加翻倍，恢复不抬高", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock, configOverrides: { speedUpPlaybackRate: 2 } });
        const { registerSpeedUpManager, startSpeedUp, getActiveSpeedUpInfo } = await import("../src/content/speedUpManager");
        const { createContentApp } = await import("../src/content/app");
        createContentApp();
        registerSpeedUpManager();

        // 用户原速 1x：A 段快进 rate=2（走 video.playbackRate 读取路径）
        video.playbackRate = 1;
        video.currentTime = 40;
        const segA = makeSegment("uuid-chain-A", 40, 60);
        const okA = await startSpeedUp([segA], [40, 60]);
        expect(okA).toBe(true);
        expect(video.playbackRate).toBe(2); // max(2, 1)

        // A 仍激活时 B 启动（无 forced rate）：基准取 A 记录的原速 1，而非 A 的快进倍速 2
        video.currentTime = 50;
        const segB = makeSegment("uuid-chain-B", 50, 80);
        const okB = await startSpeedUp([segB], [50, 80]);
        expect(okB).toBe(true);
        expect(video.playbackRate).toBe(2); // max(2, 1)，而非叠加 2+2=4
        expect(getActiveSpeedUpInfo()?.rate).toBe(2);

        // B 完成后恢复用户原速 1x，而非被抬高的 2x
        video.currentTime = 80;
        await jest.advanceTimersByTimeAsync(150);
        expect(video.playbackRate).toBe(1);
    });

    test("重复播放同一段只计数上报一次", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock });
        const { contentState } = await setupFullContent();
        const { startSpeedUp } = await import("../src/content/speedUpManager");

        const seg = makeSegment("uuid-p2-6", 10, 20);
        contentState.sponsorTimes = [seg];

        video.currentTime = 10;
        await startSpeedUp([seg], [10, 20], 1);
        video.currentTime = 20;
        await jest.advanceTimersByTimeAsync(150);

        video.currentTime = 10;
        await startSpeedUp([seg], [10, 20], 1);
        video.currentTime = 20;
        await jest.advanceTimersByTimeAsync(150);

        const posts = asyncRequestToServerMock.mock.calls.filter(
            (c) => c[0] === "POST" && String(c[1]).includes("uuid-p2-6")
        );
        expect(posts.length).toBe(1);
    });

    test("快进区间内嵌 Mute 会静音并在离开后恢复", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock });
        const { contentState } = await setupFullContent();
        const { startSpeedUp } = await import("../src/content/speedUpManager");

        const skip = makeSegment("uuid-p1-3-skip", 40, 80);
        const mute = makeSegment("uuid-p1-3-mute", 55, 65, ActionType.Mute);
        contentState.sponsorTimes = [skip, mute];

        video.currentTime = 40;
        await startSpeedUp([skip], [40, 80], 1);
        video.currentTime = 56;
        await jest.advanceTimersByTimeAsync(150);
        expect(video.muted).toBe(true);
        video.currentTime = 70;
        await jest.advanceTimersByTimeAsync(150);
        expect(video.muted).toBe(false);
    });

    test("快进中段内 seek 保持倍速不瞬时跳过", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock });
        const { app, contentState, CONTENT_EVENTS } = await setupFullContent();
        const { startSpeedUp, isSpeedUpActive } = await import("../src/content/speedUpManager");

        const seg = makeSegment("uuid-p1-4", 60, 100);
        contentState.sponsorTimes = [seg];

        video.currentTime = 60;
        await startSpeedUp([seg], [60, 100], 1);
        expect(video.playbackRate).toBe(4);

        video.currentTime = 75;
        app.bus.emit(CONTENT_EVENTS.PLAYER_SEEKING, { video }, { source: "test" });
        await Promise.resolve();
        expect(isSpeedUpActive()).toBe(true);
        expect(video.playbackRate).toBe(4);
    });

    test("暂停后恢复播放会重新进入快进", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock });
        const { app, contentState, CONTENT_EVENTS } = await setupFullContent();
        const { startSpeedUp, isSpeedUpActive } = await import("../src/content/speedUpManager");

        const seg = makeSegment("uuid-p2-5", 60, 100);
        contentState.sponsorTimes = [seg];

        video.currentTime = 60;
        await startSpeedUp([seg], [60, 100], 1.25);
        expect(video.playbackRate).toBe(4);

        app.bus.emit(CONTENT_EVENTS.PLAYER_PAUSE, { video }, { source: "test" });
        await Promise.resolve();
        expect(video.playbackRate).toBe(1.25);

        video.currentTime = 65;
        app.bus.emit(CONTENT_EVENTS.PLAYER_PLAY, { video }, { source: "test" });
        await Promise.resolve();
        await jest.advanceTimersByTimeAsync(50);
        expect(isSpeedUpActive()).toBe(true);
        expect(video.playbackRate).toBe(4);
    });

    test("完成时恢复原倍速、发 SKIP_EXECUTED 并重排后续调度", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock });
        const { app, contentState, CONTENT_EVENTS } = await setupFullContent();
        const { startSpeedUp, isSpeedUpActive } = await import("../src/content/speedUpManager");

        const startSchedule = jest.fn();
        app.commands.register("skip/startSchedule", startSchedule);

        const executed: Array<{ skipTime: number[] }> = [];
        app.bus.on(CONTENT_EVENTS.SKIP_EXECUTED, (payload) => executed.push({ skipTime: payload.skipTime as number[] }));

        const seg = makeSegment("uuid-char-complete", 10, 20);
        contentState.sponsorTimes = [seg];

        video.currentTime = 10;
        await startSpeedUp([seg], [10, 20], 1);
        expect(video.playbackRate).toBe(4);

        video.currentTime = 20;
        await jest.advanceTimersByTimeAsync(150);

        expect(isSpeedUpActive()).toBe(false);
        expect(video.playbackRate).toBe(1);
        expect(executed).toEqual([{ skipTime: [10, 20] }]);
        expect(startSchedule).toHaveBeenCalled();
    });

    test("手动取消进入冷却，冷却期内同段不再倍速", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock });
        const { contentState } = await setupFullContent();
        const { startSpeedUp, cancelSpeedUp, shouldUseSpeedUp } = await import("../src/content/speedUpManager");

        const seg = makeSegment("uuid-char-cancel", 10, 20);
        contentState.sponsorTimes = [seg];

        video.currentTime = 15;
        await startSpeedUp([seg], [10, 20], 1);
        expect(video.playbackRate).toBe(4);

        await cancelSpeedUp(true, true);
        expect(video.playbackRate).toBe(1);
        expect(shouldUseSpeedUp(seg)).toBe(false);
    });

    test("video 元素替换后旧元素倍速被恢复，不残留高倍速", async () => {
        let currentVideo = makeVideo();
        installCoreModuleMocks(currentVideo, { asyncRequestToServerMock });
        jest.doMock("../src/utils/video", () => ({
            checkIfNewVideoID: jest.fn(async () => false),
            checkVideoIDChange: jest.fn(),
            getChannelIDInfo: jest.fn(() => ({ status: 1 })),
            getVideo: jest.fn(() => currentVideo),
            getVideoID: jest.fn(() => "BV1test"),
            getCid: jest.fn(() => "1"),
        }));
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const app = createContentApp();
        app.commands.register("ui/updateActiveSegment", () => undefined);
        const { contentState } = await import("../src/content/state");
        const { registerSpeedUpManager, startSpeedUp } = await import("../src/content/speedUpManager");
        registerSpeedUpManager();

        const seg = makeSegment("uuid-video-swap", 10, 20);
        contentState.sponsorTimes = [seg];
        const oldVideo = currentVideo;
        oldVideo.currentTime = 10;
        await startSpeedUp([seg], [10, 20], 1);
        expect(oldVideo.playbackRate).toBe(4);

        // 清晰度切换等场景：video 元素被替换
        currentVideo = makeVideo();
        app.bus.emit(CONTENT_EVENTS.VIDEO_ELEMENT_CHANGED, { newVideo: true, video: currentVideo }, { source: "test" });

        expect(oldVideo.playbackRate).toBe(1);
        expect(currentVideo.playbackRate).toBe(1);
    });

    test("手动取消后段内 seek 恢复倍速而非瞬时跳过（tryResume）", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock });
        const { contentState } = await setupFullContent();
        const { startSpeedUp, cancelSpeedUp, tryResumeSpeedUpAt, isSpeedUpActive } = await import("../src/content/speedUpManager");

        const seg = makeSegment("uuid-resume-in-seg", 60, 100);
        contentState.sponsorTimes = [seg];

        video.currentTime = 60;
        await startSpeedUp([seg], [60, 100], 1);
        await cancelSpeedUp(true, true);
        expect(video.playbackRate).toBe(1);

        video.currentTime = 75;
        const resumed = tryResumeSpeedUpAt(75);
        expect(resumed).toBe(true);
        await Promise.resolve();
        expect(isSpeedUpActive()).toBe(true);
        expect(video.playbackRate).toBe(4);
    });

    test("完成重排命中紧邻下一段，高倍速过冲下也不漏", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock });
        const { contentState } = await setupFullContent();
        const { startSpeedUp, isSpeedUpActive } = await import("../src/content/speedUpManager");

        const segA = makeSegment("uuid-adjacent-a", 10, 20);
        const segB = makeSegment("uuid-adjacent-b", 20.06, 30);
        contentState.sponsorTimes = [segA, segB];

        video.currentTime = 10;
        await startSpeedUp([segA], [10, 20], 1);
        expect(video.playbackRate).toBe(4);

        // 模拟 16x 下完成判定触发时实时位置已越过结尾约 0.4s：
        // 若重排用实时时间，segB 起点(20.06)会落在过冲点(20.43)之前而被过滤，整段漏倍速
        video.currentTime = 20.43;
        for (let i = 0; i < 12 && !(isSpeedUpActive() && video.playbackRate === 4); i++) {
            await jest.advanceTimersByTimeAsync(50);
        }

        expect(isSpeedUpActive()).toBe(true);
        expect(video.playbackRate).toBe(4);
    });

    test("轮询粒度外的短内嵌 Mute 由精确定时器静音", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock });
        const { contentState } = await setupFullContent();
        const { startSpeedUp } = await import("../src/content/speedUpManager");

        const skip = makeSegment("uuid-short-mute-skip", 40, 80);
        // 0.5s 静音：4x 下仅 125ms 墙钟，100ms 轮询可能整段错过
        const mute = makeSegment("uuid-short-mute", 55, 55.5, ActionType.Mute);
        contentState.sponsorTimes = [skip, mute];

        video.currentTime = 40;
        await startSpeedUp([skip], [40, 80], 1);
        expect(video.muted).toBe(false);

        // currentTime 保持 40：轮询探测永远命中不了 [55,55.5]，静音只能来自精确定时器
        await jest.advanceTimersByTimeAsync(3760); // 入点 (55-40)/4 = 3750ms
        expect(video.muted).toBe(true);
        await jest.advanceTimersByTimeAsync(200); // 出点 (55.5-40)/4 = 3875ms
        expect(video.muted).toBe(false);
    });

    test("用户外部改倍速时取消快进并保留用户速率", async () => {
        installCoreModuleMocks(video, { asyncRequestToServerMock });
        const { app, contentState, CONTENT_EVENTS } = await setupFullContent();
        const { startSpeedUp, isSpeedUpActive } = await import("../src/content/speedUpManager");

        const seg = makeSegment("uuid-external-rate", 10, 50);
        contentState.sponsorTimes = [seg];

        video.currentTime = 10;
        await startSpeedUp([seg], [10, 50], 1);
        expect(video.playbackRate).toBe(4);

        video.playbackRate = 1.5;
        app.bus.emit(CONTENT_EVENTS.PLAYER_RATE_CHANGED, { video, playbackRate: 1.5 }, { source: "test" });
        await Promise.resolve();
        expect(video.playbackRate).toBe(1.5);
        expect(isSpeedUpActive()).toBe(false);
    });
});

describe("skipToTime 委托", () => {
    let video: HTMLVideoElement;
    let startSpeedUpMock: jest.Mock;
    let shouldUseSpeedUpMock: jest.Mock;
    let asyncRequestToServerMock: jest.Mock;

    beforeEach(() => {
        jest.resetModules();
        startSpeedUpMock = jest.fn(async () => true);
        shouldUseSpeedUpMock = jest.fn(() => false);
        asyncRequestToServerMock = jest.fn();
        installChromeMock();
        video = makeVideo({ duration: 100 });
        video.currentTime = 5;
        installCoreModuleMocks(video, { asyncRequestToServerMock });
        jest.doMock("../src/content/speedUpManager", () => ({
            cancelSpeedUp: jest.fn(),
            getSpeedUpOriginalRate: jest.fn(() => 1),
            isSpeedUpActive: jest.fn(() => false),
            isNearSpeedUpEnd: jest.fn((current: number, end: number) => current >= end - 0.05),
            shouldUseSpeedUp: shouldUseSpeedUpMock,
            startSpeedUp: startSpeedUpMock,
        }));
    });

    test("委托倍速时不 seek，由快进管理器负责分段 notice", async () => {
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

        const segment = makeSegment("uuid-1", 10, 20);
        skipToTime({
            v: video,
            skipTime: [10, 20],
            skippingSegments: [segment],
            openNotice: true,
        });

        expect(startSpeedUpMock).toHaveBeenCalledWith([segment], [10, 20], 1, true);
        expect(video.currentTime).toBe(5);
        expect(notices).toEqual([]);
        expect(executed).toEqual([{ autoSkip: true }]);
        expect(asyncRequestToServerMock).not.toHaveBeenCalled();
    });

    test("快进已激活时委托以会话原速为基准，而非实时快进倍速", async () => {
        shouldUseSpeedUpMock.mockReturnValue(true);
        jest.doMock("../src/content/speedUpManager", () => ({
            cancelSpeedUp: jest.fn(),
            getSpeedUpOriginalRate: jest.fn(() => 2),
            isSpeedUpActive: jest.fn(() => true),
            isNearSpeedUpEnd: jest.fn((current: number, end: number) => current >= end - 0.05),
            shouldUseSpeedUp: shouldUseSpeedUpMock,
            startSpeedUp: startSpeedUpMock,
        }));
        const { createContentApp } = await import("../src/content/app");
        const { skipToTime } = await import("../src/content/skipScheduler");
        createContentApp();

        // 上一段叠加后的实时速率是 4，会话记录的原速是 2：委托须以原速为基准
        video.playbackRate = 4;
        const segment = makeSegment("uuid-2", 10, 20);
        skipToTime({
            v: video,
            skipTime: [10, 20],
            skippingSegments: [segment],
            openNotice: true,
        });

        expect(startSpeedUpMock).toHaveBeenCalledWith([segment], [10, 20], 2, true);
        expect(video.currentTime).toBe(5);
    });

    test("不满足倍速条件时回退瞬时跳过", async () => {
        shouldUseSpeedUpMock.mockReturnValue(false);
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { contentState } = await import("../src/content/state");
        const { skipToTime } = await import("../src/content/skipScheduler");
        const app = createContentApp();

        const segment: SponsorTime = makeSegment("uuid-1", 10, 20);
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
        expect(video.currentTime).toBe(20);
        expect(executed).toEqual([{ autoSkip: true }]);
        expect(asyncRequestToServerMock).toHaveBeenCalledWith("POST", "/api/viewedVideoSponsorTime?UUID=uuid-1");
    });

    test("dontShowNotice=true 时倍速委托不再强制弹 notice", async () => {
        shouldUseSpeedUpMock.mockReturnValue(true);
        const config = (await import("../src/config")).default;
        config.config.dontShowNotice = true;
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { skipToTime } = await import("../src/content/skipScheduler");
        const app = createContentApp();

        const notices: unknown[] = [];
        app.bus.on(CONTENT_EVENTS.SKIP_NOTICE_REQUESTED, (payload) => notices.push(payload));

        const segment = makeSegment("uuid-1", 10, 20);
        skipToTime({
            v: video,
            skipTime: [10, 20],
            skippingSegments: [segment],
            openNotice: true,
        });

        expect(startSpeedUpMock).toHaveBeenCalled();
        expect(notices).toEqual([]);
    });
});

describe("倍速控制按钮渲染", () => {
    function setup(speedUpActive: boolean): void {
        jest.doMock("../src/config", () => ({
            __esModule: true,
            default: {
                config: {
                    colorPalette: { red: "#ff0000", white: "#ffffff", locked: "#000000" },
                    noticeVisibilityMode: 0,
                    skipNoticeDuration: 4,
                    skipKeybind: null,
                    barTypes: { sponsor: { color: "#ffffff" } },
                },
                configSyncListeners: [],
            },
        }));
        jest.doMock("../src/utils", () => ({
            __esModule: true,
            default: class {
                getSponsorIndexFromUUID = jest.fn(() => 0);
            },
        }));
        jest.doMock("../src/utils/categoryUtils", () => ({
            getSkippingText: jest.fn(() => "SKIP_TITLE"),
            getAdvanceSkipText: jest.fn(() => "ADVANCE_TITLE"),
        }));
        jest.doMock("../src/utils/formating", () => ({
            getFormattedTime: jest.fn((t: number) => String(t)),
        }));
        jest.doMock("../src/utils/noticeUtils", () => ({
            __esModule: true,
            ...jest.requireActual("../src/utils/noticeUtils"),
            downvoteButtonColor: jest.fn(() => "#000000"),
        }));
        jest.doMock("../src/utils/setup", () => ({
            generateUserID: jest.fn(() => "test-user"),
        }));
        jest.doMock("../src/utils/video", () => ({
            getCid: jest.fn(() => 1),
            getVideo: jest.fn(() => null),
        }));
        jest.doMock("../src/config/config", () => ({
            keybindToString: jest.fn(() => ""),
        }));
        jest.doMock("../src/content/speedUpManager", () => ({
            cancelSpeedUp: jest.fn(),
            clearManuallyCancelled: jest.fn(),
            getActiveSpeedUpInfo: jest.fn(() =>
                speedUpActive ? { segments: [{ UUID: "uuid-comp" }], start: 0, end: 1, rate: 4 } : null
            ),
            getSpeedUpNoticeEnd: jest.fn(() => speedUpActive ? 20 : undefined),
            startSpeedUp: jest.fn(async () => true),
        }));
        (global as unknown as { chrome: unknown }).chrome = {
            i18n: { getMessage: (key: string) => key },
            runtime: { getURL: (p: string) => p },
        };
    }

    function makeSeg(): SponsorTime {
        return { UUID: "uuid-comp", segment: [10, 20], category: "sponsor", actionType: ActionType.Skip, source: 0 } as SponsorTime;
    }

    async function renderNotice(): Promise<string> {
        const { default: SkipNoticeComponent } = await import("../src/components/SkipNoticeComponent");
        return renderToStaticMarkup(
            React.createElement(SkipNoticeComponent, {
                segments: [makeSeg()],
                autoSkip: false,
                contentContainer: {},
                closeListener: () => undefined,
                id: "test-notice",
                revision: 0,
                onInteractionChange: () => undefined,
                advanceSkipNotice: false,
            } as never)
        );
    }

    beforeEach(() => {
        jest.resetModules();
    });

    test("全尺寸模式且倍速激活时渲染暂停按钮", async () => {
        setup(true);
        const markup = await renderNotice();
        expect(markup).toContain("pauseSpeedUp");
    });

    test("倍速未激活时不渲染控制按钮", async () => {
        setup(false);
        const markup = await renderNotice();
        expect(markup).not.toContain("pauseSpeedUp");
        expect(markup).not.toContain("resumeSpeedUp");
    });
});

describe("合并片段 notice 去重", () => {
    let createdNotices: Array<{ segments: Array<{ UUID: string }>; close: jest.Mock }>;

    function makeSeg(uuid: string, start: number, end: number): SponsorTime {
        return { UUID: uuid, segment: [start, end], category: "sponsor", actionType: ActionType.Skip, source: 0 } as SponsorTime;
    }

    async function setup(): Promise<void> {
        createdNotices = [];
        jest.doMock("../src/render/SkipNotice", () => ({
            __esModule: true,
            default: class {
                segments;
                props;
                closed = false;
                upcoming = false;
                actionable = true;
                onClosed;
                isCurrentVideo = () => true;
                contains = (segments) => this.segments.every(member => segments.some(segment => segment.UUID === member.UUID));
                sameNotice = (segments) => this.segments.length === segments.length && this.contains(segments);
                setShowKeybindHint = jest.fn();
                close = jest.fn(() => {
                    const i = createdNotices.indexOf(this);
                    if (i >= 0) createdNotices.splice(i, 1);
                    this.closed = true;
                    this.onClosed(this);
                });
                constructor(update, _container, onClosed) {
                    this.segments = update.segments;
                    this.props = update;
                    this.onClosed = onClosed;
                    createdNotices.push(this);
                }
            },
        }));
        jest.doMock("../src/config", () => ({
            __esModule: true,
            default: { config: { dontShowNotice: false, skipKeybind: null } },
        }));
        jest.doMock("../src/utils/", () => ({
            waitFor: jest.fn(async () => null),
        }));
        jest.doMock("../src/utils/video", () => ({
            getVideo: jest.fn(() => null),
            getVideoID: jest.fn(() => "BV1test"),
            getCid: jest.fn(() => "1"),
            getChannelIDInfo: jest.fn(() => ({ status: 1 })),
            checkVideoIDChange: jest.fn(),
            checkIfNewVideoID: jest.fn(async () => false),
        }));
        jest.doMock("../src/utils/injectedScriptMessageUtils", () => ({
            sourceId: "test-source",
            getCidMapFromWindow: jest.fn(async () => new Map()),
        }));
        jest.doMock("../src/content/skipNoticeContentContainer", () => ({
            getSkipNoticeContentContainer: jest.fn(() => document.createElement("div")),
        }));
        const { createContentApp } = await import("../src/content/app");
        const { registerSkipUIManager } = await import("../src/content/skipUIManager");
        createContentApp();
        registerSkipUIManager();
    }

    async function emitNotice(segments: SponsorTime[]): Promise<void> {
        const { getContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        getContentApp().bus.emit(CONTENT_EVENTS.SKIP_NOTICE_REQUESTED, {
            noticeKind: "skip",
            skippingSegments: segments,
            autoSkip: false,
            unskipTime: null,
            startReskip: false,
        }, { source: "test" });
    }

    test("合并播放范围分别显示 A、B，再请求 B 不重复创建", async () => {
        await setup();
        const segA = makeSeg("uuid-merge-a", 10, 20);
        const segB = makeSeg("uuid-merge-b", 20.06, 30);

        await emitNotice([segA, segB]);
        expect(createdNotices).toHaveLength(2);
        expect(createdNotices.map(notice => notice.segments.map(segment => segment.UUID))).toEqual([[segA.UUID], [segB.UUID]]);

        // 倍速穿过第二段起点时调度产生的子区间请求
        await emitNotice([segB]);
        expect(createdNotices).toHaveLength(2);
    });

    test("快进完成不会重新打开用户已关闭的卡片", async () => {
        await setup();
        const segment = makeSeg("dismissed", 10, 20);
        await emitNotice([segment]);
        createdNotices[0].close();
        const { getContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        getContentApp().bus.emit(CONTENT_EVENTS.SKIP_NOTICE_REQUESTED, {
            noticeKind: "skip", skippingSegments: [segment], autoSkip: true,
            startReskip: false, updateOnly: true,
        }, { source: "test.completion" });
        expect(createdNotices).toHaveLength(0);
    });

    test("不同 UUID 的新请求正常创建，不受去重误伤", async () => {
        await setup();
        const segA = makeSeg("uuid-new-a", 10, 20);
        const segB = makeSeg("uuid-new-b", 40, 50);

        await emitNotice([segA]);
        await emitNotice([segB]);
        expect(createdNotices).toHaveLength(2);
    });

    test("closeNoticesForSegments 只关闭含对应 UUID 的 notice", async () => {
        await setup();
        const segA = makeSeg("uuid-close-a", 10, 20);
        const segB = makeSeg("uuid-close-b", 40, 50);

        await emitNotice([segA]);
        await emitNotice([segB]);
        expect(createdNotices).toHaveLength(2);

        const { getContentApp } = await import("../src/content/app");
        // 快进完成回调用：A 已完成，B 的 notice 应保留
        await getContentApp().commands.execute("skip/closeNoticesForSegments", {
            segments: [makeSeg("uuid-close-a", 10, 20)],
        });
        expect(createdNotices).toHaveLength(1);
        expect(createdNotices[0].segments[0].UUID).toBe("uuid-close-b");

        await getContentApp().commands.execute("skip/closeNoticesForSegments", {
            segments: [makeSeg("uuid-close-b", 40, 50)],
        });
        expect(createdNotices).toHaveLength(0);
    });
});
