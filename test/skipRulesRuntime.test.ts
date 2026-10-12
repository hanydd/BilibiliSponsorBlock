/** @jest-environment jsdom */
import { ActionType } from '../src/types';
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
    return { video, Config, contentState, runtime, ports, play, audio, beep };
}

afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

test.each([false, true])('custom sound, volume and fade apply to automatic playback (speed=%s)', async enableSpeedUp => {
    const { video, Config, runtime, audio, beep } = await setup({ enableSpeedUp, skipSoundVolume: 0.4, skipSoundFadeStart: 0.5 });
    Object.assign(Config, { local: { customSkipSound: { dataUrl: 'data:audio/wav;base64,test', name: 'custom.wav' } } });
    video.volume = 0.8;
    Object.defineProperty(beep, 'duration', { configurable: true, value: 4 });
    runtime.observe();
    expect(audio).toHaveBeenCalledWith(Config.local.customSkipSound.dataUrl);
    expect(beep.volume).toBe(0.4);
    beep.currentTime = 3;
    jest.advanceTimersByTime(40);
    expect(beep.volume).toBeCloseTo(0.2);
    beep.dispatchEvent(new Event('ended'));
    beep.volume = 0.3;
    beep.currentTime = 3.5;
    jest.advanceTimersByTime(40);
    expect(beep.volume).toBe(0.3);
    runtime.reset();
});

test('shared sound used by the legacy scheduler falls back and releases fades on rejection', async () => {
    const { video, audio, beep, play, runtime } = await setup({ skipSoundVolume: NaN, skipSoundFadeStart: 0.5 });
    const { notifyAutomaticSkip } = await import('../src/content/skipNotification');
    play.mockRejectedValue(new Error('audio blocked'));
    Object.defineProperty(beep, 'duration', { configurable: true, value: 4 });
    notifyAutomaticSkip(video);
    expect(audio).toHaveBeenCalledWith(expect.stringContaining('icons/beep.ogg'));
    expect(beep.volume).toBe(0.1);
    await Promise.resolve();
    beep.currentTime = 3;
    jest.advanceTimersByTime(40);
    expect(beep.volume).toBe(0.1);
    runtime.reset();
});

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

test('hidden completion remains undoable, without publishing a notice', async () => {
    const { video, runtime, contentState } = await setup({ dontShowNotice: true, enableSpeedUp: false });
    contentState.sponsorTimes = [makeSegment('A', 10, 50)];
    const { getContentApp } = await import('../src/content/app');
    const { CONTENT_EVENTS } = await import('../src/content/app/events');
    const notices = jest.fn();
    getContentApp().bus.on(CONTENT_EVENTS.SKIP_NOTICE_REQUESTED, notices);
    runtime.observe();
    expect(video.currentTime).toBe(50);
    expect(runtime.toggleSkip()).toBe(true);
    expect(video.currentTime).toBe(10);
    jest.advanceTimersByTime(500);
    expect(video.currentTime).toBe(10);
    expect(notices).not.toHaveBeenCalled();
    runtime.reset();
    expect(runtime.toggleSkip()).toBe(false);
});

test.each(['expiry', 'seek', 'video', 'mode', 'dismiss'] as const)('hidden undo target is released on %s', async reason => {
    const { video, runtime, contentState, Config } = await setup({ dontShowNotice: true, enableSpeedUp: false, skipNoticeDuration: 1 });
    contentState.sponsorTimes = [makeSegment('A', 10, 50)];
    runtime.observe();
    expect(video.currentTime).toBe(50);
    if (reason === 'expiry') {
        jest.advanceTimersByTime(600);
        Config.config.dontShowNotice = false; runtime.observe();
        Config.config.dontShowNotice = true; runtime.observe();
        jest.advanceTimersByTime(450);
    } else if (reason === 'seek') {
        video.currentTime = 70;
        video.dispatchEvent(new Event('seeking'));
    } else if (reason === 'mode') {
        Config.config.skipEngineMode = 'legacy'; runtime.observe();
    } else if (reason === 'video') {
        const { getVideoID } = await import('../src/utils/video');
        (getVideoID as jest.Mock).mockReturnValue('BV2test');
        runtime.observe();
    } else runtime.action({ kind: 'dismiss', id: 'A' });
    expect(runtime.toggleSkip()).toBe(false);
    runtime.reset();
});

test('hidden paused pending segment can be skipped and undone without playing', async () => {
    const { video, runtime, contentState } = await setup({ dontShowNotice: true, enableSpeedUp: false });
    contentState.sponsorTimes = [makeSegment('A', 10, 50)];
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    runtime.observe();
    expect(video.currentTime).toBe(12);
    expect(runtime.toggleSkip()).toBe(true);
    expect(video.currentTime).toBe(50);
    expect(runtime.toggleSkip()).toBe(true);
    expect(video.currentTime).toBe(10);
    expect(video.paused).toBe(true);
    runtime.reset();
});

test('hidden preview shortcut cancels the upcoming visit and later Enter skips explicitly', async () => {
    const { video, runtime, contentState } = await setup({ dontShowNotice: true, enableSpeedUp: false, advanceSkipNotice: true, skipNoticeDurationBefore: 3 });
    contentState.sponsorTimes = [makeSegment('A', 10, 50)];
    video.currentTime = 8;
    runtime.observe();
    expect(runtime.toggleSkip()).toBe(true);
    video.currentTime = 10; runtime.observe();
    expect(video.currentTime).toBe(10);
    expect(runtime.toggleSkip()).toBe(true);
    expect(video.currentTime).toBe(50);
    runtime.reset();
});

test('hidden shortcut follows the newest segment and drops removed data', async () => {
    const { video, runtime, contentState } = await setup({ dontShowNotice: true, enableSpeedUp: false });
    contentState.sponsorTimes = [makeSegment('A', 10, 20), makeSegment('B', 30, 40)];
    runtime.observe();
    expect(video.currentTime).toBe(20);
    video.currentTime = 31; runtime.observe();
    expect(video.currentTime).toBe(40);
    expect(runtime.toggleSkip()).toBe(true);
    expect(video.currentTime).toBe(30);
    contentState.sponsorTimes = []; runtime.observe();
    expect(runtime.toggleSkip()).toBe(false);
    runtime.reset();
});

test.each(['pause', 'waiting'])('disabling speed during %s restores baseline without seeking', async event => {
    const { video, runtime, Config } = await setup();
    video.playbackRate = 1.5;
    runtime.observe();
    expect(video.playbackRate).toBe(4);
    if (event === 'pause') Object.defineProperty(video, 'paused', { configurable: true, value: true });
    video.dispatchEvent(new Event(event));
    expect(video.playbackRate).toBe(4);
    Config.config.enableSpeedUp = false;
    runtime.observe();
    expect(video.playbackRate).toBe(1.5);
    expect(video.currentTime).toBe(12);
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    video.dispatchEvent(new Event('playing'));
    expect(video.currentTime).toBe(40);
    runtime.reset();
});

test.each([ActionType.Skip, ActionType.Mute])('removing paused %s owners releases only their effect', async action => {
    const { video, runtime, contentState } = await setup({ muteSegments: true });
    video.playbackRate = 1.5;
    const a = makeSegment('A', 10, 50, action);
    const b = makeSegment('B', 10, 60, action);
    contentState.sponsorTimes = [a, b];
    runtime.observe();
    const active = action === ActionType.Skip ? { playbackRate: 4, muted: false } : { playbackRate: 1.5, muted: true };
    expect(video).toMatchObject(active);
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    video.dispatchEvent(new Event('pause'));
    contentState.sponsorTimes = [b]; runtime.observe();
    expect(video).toMatchObject(active);
    contentState.sponsorTimes = []; runtime.observe();
    expect(video).toMatchObject({ playbackRate: 1.5, muted: false, currentTime: 12 });
    contentState.sponsorTimes = [a]; runtime.observe();
    expect(video).toMatchObject({ playbackRate: 1.5, muted: false, currentTime: 12 });
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    video.dispatchEvent(new Event('playing'));
    expect(video).toMatchObject(active);
    runtime.reset();
});

test('temporarily missing data preserves same-pass dismissal without keeping an effect', async () => {
    const { video, runtime, contentState } = await setup();
    runtime.observe();
    runtime.action({ kind: 'dismiss', id: 'A' });
    const segments = contentState.sponsorTimes;
    contentState.sponsorTimes = []; runtime.observe();
    contentState.sponsorTimes = segments; runtime.observe();
    expect(video.playbackRate).toBe(1);
    expect(runtime.isExcluded('A')).toBe(true);
    runtime.reset();
});

test('rules preview entry marks a draft as previewed and executes that draft', async () => {
    const { video, runtime, contentState } = await setup();
    const { installRuleRuntime } = await import('../src/content/skipRules/bridge');
    installRuleRuntime(runtime);
    contentState.sponsorTimesSubmitting = [makeSegment('draft', 10, 20)];
    contentState.sponsorTimes = [];
    runtime.observe();
    contentState.previewedSegment = false;
    const { previewTime } = await import('../src/content/skipScheduler');
    previewTime(8, true, 'draft');
    expect(contentState.previewedSegment).toBe(true);
    expect(video.currentTime).toBe(8);
    video.currentTime = 10;
    video.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(20);
    runtime.reset();
});

test.each([500, 1500])('unhiding completion preserves its clock, suppressing expired notices (elapsed=%s)', async elapsed => {
    const { Config, runtime, contentState } = await setup({ dontShowNotice: true, enableSpeedUp: false, skipNoticeDuration: 1 });
    contentState.sponsorTimes = [makeSegment('A', 10, 50)];
    const { getContentApp } = await import('../src/content/app');
    const { CONTENT_EVENTS } = await import('../src/content/app/events');
    const notices = jest.fn();
    getContentApp().bus.on(CONTENT_EVENTS.SKIP_NOTICE_REQUESTED, notices);
    runtime.observe();
    jest.advanceTimersByTime(elapsed);
    Config.config.dontShowNotice = false; runtime.observe();
    expect(notices).toHaveBeenCalledTimes(elapsed < 1000 ? 1 : 0);
    if (elapsed < 1000) {
        const clock = notices.mock.calls[0][0].noticeClock;
        expect(clock.read()).toBe(500);
        clock.setPaused(true); // The visible card owns hover/pause, using the same clock.
        jest.advanceTimersByTime(2000);
        expect(clock.read()).toBe(500);
        Config.config.dontShowNotice = true; runtime.observe();
        jest.advanceTimersByTime(600);
        expect(runtime.toggleSkip()).toBe(false);
        Config.config.dontShowNotice = false; runtime.observe();
        expect(notices).toHaveBeenCalledTimes(1);
    }
    runtime.reset();
});

test('real and simulated mute cancellation protect overlapping peers until the target ends', async () => {
    const { video, runtime, contentState } = await setup({ muteSegments: true });
    contentState.sponsorTimes = [makeSegment('A', 10, 20, ActionType.Mute), makeSegment('B', 15, 25, ActionType.Mute)];
    video.currentTime = 16; runtime.observe();
    expect(video.muted).toBe(true);
    runtime.toggleSkip('A');
    expect(video.muted).toBe(false);
    expect(video.currentTime).toBe(16);
    const { makeSimulation, step } = await import('../src/options/rules/model');
    const settings = { entry: true, preview: 3, duration: 4, rate: 4, showCards: true, resumeEntry: 'continue', resumeSpeed: 'continue', context: 'mute' } as const;
    let simulated = step(makeSimulation(settings, 'auto', 'ready', 'overlap', 'auto'), { kind: 'time', time: 16 }).state;
    expect(simulated.muted).toBe(true);
    simulated = step(simulated, { kind: 'cancel', id: 'A' }).state;
    expect(simulated.muted).toBe(video.muted);
    expect(simulated.time).toBe(video.currentTime);
    video.currentTime = 20; runtime.observe();
    simulated = step(simulated, { kind: 'time', time: 20 }).state;
    expect(simulated.muted).toBe(true);
    expect(video.muted).toBe(true);
    runtime.reset();
});


test.each([500, 1500])('same-video handoff preserves completion expiry (elapsed=%s)', async elapsed => {
    const { video, Config, runtime, contentState } = await setup({ dontShowNotice: true, enableSpeedUp: false, skipNoticeDuration: 1 });
    contentState.sponsorTimes = [makeSegment('A', 10, 50)];
    const { getVideo } = await import('../src/utils/video');
    const { getContentApp } = await import('../src/content/app');
    const { CONTENT_EVENTS } = await import('../src/content/app/events');
    const notices = jest.fn();
    getContentApp().bus.on(CONTENT_EVENTS.SKIP_NOTICE_REQUESTED, notices);
    runtime.observe();
    jest.advanceTimersByTime(elapsed);
    const replacement = makeVideo();
    replacement.currentTime = video.currentTime;
    (getVideo as jest.Mock).mockReturnValue(replacement);
    runtime.observe();
    Config.config.dontShowNotice = false; runtime.observe();
    expect(notices).toHaveBeenCalledTimes(elapsed < 1000 ? 1 : 0);
    if (elapsed < 1000) expect(notices.mock.calls[0][0].noticeClock.read()).toBe(500);
    Config.config.dontShowNotice = true; runtime.observe();
    jest.advanceTimersByTime(600);
    expect(runtime.toggleSkip()).toBe(false);
    runtime.reset();
});

test('same-video handoff preserves dismissal; another video on the same element clears it', async () => {
    const { video, runtime, contentState } = await setup();
    contentState.sponsorTimes = [makeSegment('A', 10, 50)];
    const { getVideo, getVideoID } = await import('../src/utils/video');
    runtime.observe();
    runtime.action({ kind: 'dismiss', id: 'A' });
    const replacement = makeVideo();
    replacement.currentTime = video.currentTime;
    (getVideo as jest.Mock).mockReturnValue(replacement);
    runtime.observe();
    expect(runtime.isExcluded('A')).toBe(true);
    expect(replacement.playbackRate).toBe(1);
    (getVideoID as jest.Mock).mockReturnValue('BV2test');
    runtime.observe();
    expect(runtime.isExcluded('A')).toBe(false);
    expect(replacement.playbackRate).toBe(4);
    runtime.reset();
});

test.each([ActionType.Skip, ActionType.Mute])('same-video handoff restores copied %s effects and detaches old listeners', async action => {
    const { video, runtime, contentState, play } = await setup({ muteSegments: true });
    video.playbackRate = 1.5;
    contentState.sponsorTimes = [makeSegment('A', 10, 20, action)];
    const { getVideo } = await import('../src/utils/video');
    runtime.observe();
    const replacement = makeVideo({ rate: video.playbackRate, muted: video.muted });
    replacement.currentTime = 15;
    (getVideo as jest.Mock).mockReturnValue(replacement);
    runtime.observe();
    expect(video).toMatchObject({ playbackRate: 1.5, muted: false });
    expect(replacement).toMatchObject(action === ActionType.Skip ? { playbackRate: 4 } : { muted: true });
    // Events queued on the retired element cannot cancel the current effect.
    video.dispatchEvent(new Event('ratechange'));
    video.dispatchEvent(new Event('volumechange'));
    runtime.observe();
    expect(replacement).toMatchObject(action === ActionType.Skip ? { playbackRate: 4 } : { muted: true });
    if (action === ActionType.Skip) expect(play).toHaveBeenCalledTimes(1);
    replacement.currentTime = 20;
    replacement.dispatchEvent(new Event('timeupdate'));
    expect(replacement).toMatchObject({ playbackRate: 1.5, muted: false });
    runtime.reset();
});
