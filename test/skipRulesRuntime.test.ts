/** @jest-environment jsdom */
import { installChromeMock, installCoreModuleMocks, makeSegment, makeVideo } from './helpers/contentHarness';

async function setup(settings = {}) {
    jest.resetModules();
    jest.useFakeTimers();
    installChromeMock();
    const video = makeVideo();
    video.currentTime = 12;
    installCoreModuleMocks(video, { configOverrides: { skipEngineMode: 'rules', audioNotificationOnSkip: true, ...settings } });
    const { default: Config } = await import('../src/config');
    Object.assign(Config, { isReady: () => true });
    const { createContentApp } = await import('../src/content/app');
    createContentApp();
    const { contentState } = await import('../src/content/state');
    contentState.sponsorTimes = [makeSegment('A', 10, 20), makeSegment('B', 20, 40)];
    const { SkipRulesRuntime } = await import('../src/content/skipRules/runtime');
    const ports = { stopLegacy: jest.fn(), startLegacy: jest.fn(), record: jest.fn() };
    const runtime = new SkipRulesRuntime(ports);
    const beep = document.createElement('audio');
    const play = jest.spyOn(beep, 'play').mockResolvedValue(undefined);
    const audio = jest.spyOn(window, 'Audio').mockImplementation(() => beep);
    return { video, Config, contentState, runtime, ports, play, audio };
}

afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

test('merged automatic skips notify once; repeated observation does not replay sound', async () => {
    const { video, runtime, play, ports } = await setup({ enableSpeedUp: false });
    runtime.observe();
    expect(video.currentTime).toBe(40);
    expect(play).toHaveBeenCalledTimes(1);
    expect(ports.record).toHaveBeenCalledTimes(1);
    runtime.observe();
    jest.advanceTimersByTime(500);
    expect(play).toHaveBeenCalledTimes(1);
    runtime.reset();
});

test('fast forward notifies at each new segment, not on pause/resume or polling', async () => {
    const { video, runtime, play } = await setup();
    runtime.observe();
    expect(video.playbackRate).toBe(4);
    expect(play).toHaveBeenCalledTimes(1);
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    video.dispatchEvent(new Event('pause'));
    jest.advanceTimersByTime(200);
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    video.dispatchEvent(new Event('playing'));
    expect(play).toHaveBeenCalledTimes(1);
    video.currentTime = 20;
    video.dispatchEvent(new Event('timeupdate'));
    expect(play).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(500);
    expect(play).toHaveBeenCalledTimes(2);
    runtime.reset();
});

test.each(['disabled', 'muted', 'draft', 'manual'] as const)('%s skips stay silent', async kind => {
    const { video, runtime, play, contentState, Config } = await setup({ enableSpeedUp: false });
    if (kind === 'disabled') Config.config.audioNotificationOnSkip = false;
    if (kind === 'muted') video.muted = true;
    if (kind === 'draft') { contentState.sponsorTimesSubmitting = contentState.sponsorTimes; contentState.sponsorTimes = []; }
    if (kind === 'manual') Object.defineProperty(video, 'paused', { configurable: true, value: true });
    runtime.observe();
    if (kind === 'manual') runtime.action({ kind: 'skip', id: 'A' });
    if (kind === 'draft') runtime.preview(12, true, 'A');
    expect(video.currentTime).toBeGreaterThanOrEqual(20);
    expect(play).not.toHaveBeenCalled();
    runtime.reset();
});

test('audio rejection does not prevent the next automatic skip', async () => {
    const { video, runtime, play, contentState } = await setup({ enableSpeedUp: false });
    contentState.sponsorTimes[1].segment = [30, 40];
    play.mockRejectedValue(new Error('autoplay blocked'));
    runtime.observe();
    expect(video.currentTime).toBe(20);
    await Promise.resolve();
    video.currentTime = 31;
    runtime.observe();
    expect(video.currentTime).toBe(40);
    await Promise.resolve();
    runtime.reset();
});

test('engine handoff releases owned rate while paused and preserves the user baseline', async () => {
    const { video, runtime, Config, ports } = await setup();
    video.playbackRate = 1.5;
    runtime.observe();
    expect(video.playbackRate).toBe(4);
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    video.dispatchEvent(new Event('pause'));
    Config.config.skipEngineMode = 'legacy'; runtime.observe();
    expect(runtime.mode).toBe('legacy');
    expect(video.playbackRate).toBe(1.5);
    expect(video.currentTime).toBe(12);
    expect(ports.startLegacy).toHaveBeenCalledTimes(1);
    Config.config.skipEngineMode = 'rules'; runtime.observe();
    expect(runtime.mode).toBe('rules');
    expect(video.playbackRate).toBe(1.5);
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    video.dispatchEvent(new Event('playing'));
    expect(video.playbackRate).toBe(4);
    Config.config.skipEngineMode = 'shadow'; runtime.observe();
    expect(runtime.mode).toBe('shadow');
    expect(video.playbackRate).toBe(1.5);
    runtime.reset();
});

test('a rejected seek neither plays a notification nor records a completed skip', async () => {
    const { video, runtime, play, ports } = await setup({ enableSpeedUp: false });
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 12, set: () => undefined });
    runtime.observe();
    jest.advanceTimersByTime(500);
    expect(play).not.toHaveBeenCalled();
    expect(ports.record).not.toHaveBeenCalled();
    runtime.reset();
});
