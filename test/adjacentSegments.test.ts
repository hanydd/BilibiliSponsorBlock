/** @jest-environment jsdom */
import { Category, CategorySkipOption } from '../src/types';
import { installChromeMock, installCoreModuleMocks, makeSegment, makeVideo, setupFullContent } from './helpers/contentHarness';

for (const firstOption of [CategorySkipOption.AutoSkip, CategorySkipOption.ManualSkip]) {
    for (const secondOption of [CategorySkipOption.AutoSkip, CategorySkipOption.ManualSkip]) {
        test(`contiguous segments hand off without user-seek skipping: ${firstOption} -> ${secondOption}`, async () => {
            jest.resetModules();
            jest.useFakeTimers();
            installChromeMock();
            const video = makeVideo();
            video.currentTime = 0.233;
            installCoreModuleMocks(video, { configOverrides: { enableSpeedUp: false, skipOnSeekToSegment: false } });
            const Utils = (await import('../src/utils')).default as unknown as jest.Mock;
            Utils.mockImplementation(() => ({
                getCategorySelection: (category: string) => ({ option: category === 'intro' ? firstOption : secondOption }),
                getTimestampsDuration: () => 0,
            }));
            const { app, contentState, CONTENT_EVENTS } = await setupFullContent();
            const first = { ...makeSegment('intro', 0, 8.133), category: 'intro' as Category };
            const second = { ...makeSegment('outro', 8.133, 20.566), category: 'outro' as Category };
            contentState.sponsorTimes = [first, second];
            const notices: string[][] = [];
            app.bus.on(CONTENT_EVENTS.SKIP_NOTICE_REQUESTED, payload => notices.push(payload.skippingSegments.map(segment => segment.UUID)));
            const { startSkipScheduleCheckingForStartSponsors, reskipSponsorTime, resetSchedulerState } = await import('../src/content/skipScheduler');
            try {
                startSkipScheduleCheckingForStartSponsors();
                for (let i = 0; i < 30; i++) await Promise.resolve();
                if (firstOption === CategorySkipOption.ManualSkip) {
                    expect(notices.some(ids => ids.includes(first.UUID))).toBe(true);
                    reskipSponsorTime(first);
                    for (let i = 0; i < 30; i++) await Promise.resolve();
                }
                expect(notices.some(ids => ids.includes(second.UUID))).toBe(true);
                expect(video.currentTime).toBe(secondOption === CategorySkipOption.AutoSkip ? 20.566 : 8.133);
            } finally {
                resetSchedulerState();
                jest.clearAllTimers();
                jest.useRealTimers();
            }
        });
    }
}
