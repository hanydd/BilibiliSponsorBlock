/** @jest-environment jsdom */
import { installChromeMock, installCoreModuleMocks, makeSegment, makeVideo, setupFullContent } from "./helpers/contentHarness";

test.each([1, 2])("seek intent survives buffering during video ID check %s", async (check) => {
    jest.resetModules();
    jest.useFakeTimers();
    installChromeMock();
    const video = makeVideo();
    video.currentTime = 6;
    installCoreModuleMocks(video, { configOverrides: { enableSpeedUp: false } });
    const { app, contentState, CONTENT_EVENTS } = await setupFullContent();
    contentState.sponsorTimes = [makeSegment("delayed-id", 5, 20)];
    const { getBilibiliVideoID } = await import("../src/utils/parseVideoID");
    const lookup = getBilibiliVideoID as jest.Mock;
    let resolveLookup!: (value: string) => void;
    const delayedLookup = new Promise<string>((resolve) => { resolveLookup = resolve; });
    for (let i = 1; i < check; i++) lookup.mockResolvedValueOnce("BV1test");
    lookup.mockImplementationOnce(() => delayedLookup);
    try {
        app.bus.emit(CONTENT_EVENTS.PLAYER_SEEKING, { video }, { source: "test" });
        for (let i = 0; i < 20 && lookup.mock.calls.length < check; i++) await Promise.resolve();
        expect(lookup).toHaveBeenCalledTimes(check);
        // Supersede the seek schedule after scanning, or immediately before executing it.
        app.bus.emit(CONTENT_EVENTS.PLAYER_WAITING, { video }, { source: "test" });
        app.bus.emit(CONTENT_EVENTS.PLAYER_PLAYING, { video }, { source: "test" });
        for (let i = 0; i < 20; i++) await Promise.resolve();
        resolveLookup("BV1test");
        for (let i = 0; i < 20; i++) await Promise.resolve();
        expect(video.currentTime).toBe(20);
    } finally {
        const { resetSchedulerState } = await import("../src/content/skipScheduler");
        resetSchedulerState();
        jest.clearAllTimers();
        jest.useRealTimers();
    }
});

test('opening segment survives a playback restart during initial scheduling', async () => {
    jest.resetModules();
    jest.useFakeTimers();
    installChromeMock();
    const video = makeVideo();
    video.currentTime = 0.1;
    installCoreModuleMocks(video, { configOverrides: { enableSpeedUp: false } });
    const { app, contentState, CONTENT_EVENTS } = await setupFullContent();
    contentState.sponsorTimes = [makeSegment('opening-segment', 0, 20)];
    contentState.switchingVideos = false;
    const { startSkipScheduleCheckingForStartSponsors, resetSchedulerState } = await import('../src/content/skipScheduler');
    try {
        startSkipScheduleCheckingForStartSponsors();
        app.bus.emit(CONTENT_EVENTS.PLAYER_WAITING, { video }, { source: 'test' });
        app.bus.emit(CONTENT_EVENTS.PLAYER_PLAYING, { video }, { source: 'test' });
        for (let i = 0; i < 25; i++) await Promise.resolve();
        expect(video.currentTime).toBe(20);
    } finally {
        resetSchedulerState();
        jest.clearAllTimers();
        jest.useRealTimers();
    }
});

test.each([true, false])('paused seek near zero respects skipOnSeekToSegment=%s after playback resumes', async (skipOnSeekToSegment) => {
    jest.resetModules();
    jest.useFakeTimers();
    installChromeMock();
    const video = makeVideo();
    video.currentTime = 30;
    installCoreModuleMocks(video, { configOverrides: { enableSpeedUp: false, skipOnSeekToSegment } });
    const { app, contentState, CONTENT_EVENTS } = await setupFullContent();
    contentState.sponsorTimes = [makeSegment('opening-segment', 0, 20)];
    contentState.switchingVideos = false;
    const { resetSchedulerState } = await import('../src/content/skipScheduler');
    try {
        app.bus.emit(CONTENT_EVENTS.PLAYER_PLAY, { video }, { source: 'test' });
        for (let i = 0; i < 25; i++) await Promise.resolve();
        Object.defineProperty(video, 'paused', { configurable: true, value: true });
        app.bus.emit(CONTENT_EVENTS.PLAYER_PAUSE, { video }, { source: 'test' });
        // Bilibili may snap a request for zero to the first decoded frame.
        video.currentTime = .233;
        app.bus.emit(CONTENT_EVENTS.PLAYER_SEEKING, { video }, { source: 'test' });
        Object.defineProperty(video, 'paused', { configurable: true, value: false });
        app.bus.emit(CONTENT_EVENTS.PLAYER_PLAY, { video }, { source: 'test' });
        app.bus.emit(CONTENT_EVENTS.PLAYER_PLAYING, { video }, { source: 'test' });
        for (let i = 0; i < 25; i++) await Promise.resolve();
        expect(video.currentTime).toBe(skipOnSeekToSegment ? 20 : .233);
    } finally {
        resetSchedulerState();
        jest.clearAllTimers();
        jest.useRealTimers();
    }
});
