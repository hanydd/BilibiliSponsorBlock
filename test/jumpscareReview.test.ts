/** @jest-environment jsdom */
import { ActionType, Category, CategorySkipOption } from '../src/types';
import { installChromeMock, installCoreModuleMocks, makeSegment, makeVideo, setupFullContent } from './helpers/contentHarness';

afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
async function setup(option = CategorySkipOption.AutoMute) {
    jest.resetModules(); jest.useFakeTimers(); installChromeMock();
    const video = makeVideo(); video.currentTime = 12;
    installCoreModuleMocks(video, { configOverrides: { enableSpeedUp: false, muteSegments: true, categorySelections: [
        { name: 'jumpscare', option }, { name: 'sponsor', option: CategorySkipOption.AutoSkip } ] } });
    const harness = await setupFullContent();
    const scheduler = await import('../src/content/skipScheduler');
    return { video, ...harness, ...scheduler };
}
test('legacy merges overlapping mute submissions using effective skip action in one seek', async () => {
    const h = await setup(CategorySkipOption.AutoSkip);
    h.contentState.sponsorTimes = [makeSegment('a', 10, 25, ActionType.Mute), makeSegment('b', 20, 40, ActionType.Mute)].map(s => ({ ...s, category: 'jumpscare' as Category }));
    const seeks: number[] = []; let time = 12;
    Object.defineProperty(h.video, 'currentTime', { configurable: true, get: () => time, set: value => { time = value; seeks.push(value); } });
    await h.startSponsorSchedule(true);
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(seeks).toEqual([40]);
    h.resetSchedulerState(true);
});
test('legacy ordinary unmute keeps protective owner, then releases at its end', async () => {
    const h = await setup();
    const scare = { ...makeSegment('scare', 10, 30), category: 'jumpscare' as Category };
    const ordinary = makeSegment('ordinary', 10, 20, ActionType.Mute);
    h.contentState.sponsorTimes = [scare, ordinary];
    h.skipToTime({ v: h.video, skipTime: [10, 30], skippingSegments: [scare], openNotice: false });
    expect(h.video.muted).toBe(true);
    h.unskipSponsorTime(ordinary);
    expect(h.video.muted).toBe(true);
    expect(h.inMuteSegment(12, false)).toBe(true);
    expect(h.inMuteSegment(31, false)).toBe(false);
    h.video.currentTime = 31;
    h.app.bus.emit(h.CONTENT_EVENTS.PLAYER_TIME_UPDATED, { time: 31 });
    expect(h.video.muted).toBe(false);
    h.resetSchedulerState(true);
});

test.each([1, 2, 3])('legacy shortcut ignores hidden jumpscare %s', async hidden => {
    const h = await setup();
    const { default: Config } = await import('../src/config');
    Config.config.skipKeybind = { key: 'Enter' };
    h.contentState.sponsorTimes = [{ ...makeSegment('scare', 10, 30), category: 'jumpscare' as Category, hidden }];
    const listeners: EventListener[] = [];
    const spy = jest.spyOn(document.body, 'addEventListener').mockImplementation((name, listener) => {
        if (name === 'keydown') listeners.push(listener as EventListener);
    });
    Object.defineProperty(document, 'readyState', { configurable: true, value: 'complete' });
    const { addHotkeyListener } = await import('../src/content/hotkeyHandler');
    addHotkeyListener();
    expect(listeners).toHaveLength(1);
    listeners[0](new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(h.video.currentTime).toBe(12);
    h.reskipSponsorTime(h.contentState.sponsorTimes[0], true);
    expect(h.video.currentTime).toBe(12);
    spy.mockRestore(); h.resetSchedulerState(true);
});
