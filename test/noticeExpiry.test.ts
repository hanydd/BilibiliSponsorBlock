/** @jest-environment jsdom */
import { installChromeMock, installCoreModuleMocks, makeSegment, makeVideo, setupFullContent } from './helpers/contentHarness';

// A speed-up session may finish 50ms before its end, and virtual media time can
// also run ahead of currentTime. The next manual card must survive that handoff.
test.each([
    [8.103, 'timeupdate', false],
    [8.133, 'timeupdate', false],
    [8.0, 'seeking', true],
    [20.566, 'timeupdate', true],
] as const)('pending card at %s on %s closes=%s', async (time, event, shouldClose) => {
    jest.resetModules();
    installChromeMock();
    const video = makeVideo();
    video.currentTime = time;
    installCoreModuleMocks(video, { configOverrides: {
        colorPalette: { red: '#f00', white: '#fff', locked: '#000' },
    } });
    await setupFullContent();
    const Config = (await import('../src/config')).default;
    Config.configSyncListeners = [];
    const SkipNoticeComponent = (await import('../src/components/SkipNoticeComponent')).default;
    const closed = jest.fn();
    const notice = new SkipNoticeComponent({
        id: 'adjacent-manual', revision: 0,
        segments: [makeSegment('adjacent-manual', 8.133, 20.566)],
        autoSkip: false, contentContainer: jest.fn(),
        closeListener: closed, onInteractionChange: jest.fn(),
    });
    notice.componentDidMount();
    try {
        video.dispatchEvent(new Event(event));
        expect(closed).toHaveBeenCalledTimes(shouldClose ? 1 : 0);
    } finally {
        notice.componentWillUnmount();
    }
});
