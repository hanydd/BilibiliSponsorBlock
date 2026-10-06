import { UpcomingSkipDecision } from "../src/notices/UpcomingSkipDecision";
import { NoticeClock, secondsUntilSegment } from "../src/notices/NoticeClock";
import { initialPlayback, noticePresentation, SegmentPlaybackState } from "../src/notices/SkipNoticeModel";
import { occupiedViewport, stackOffsets } from "../src/notices/StackLayout";
import { ActionType, NoticeVisibilityMode } from "../src/types";

test("short interruptions preserve fractional elapsed time and independent pauses", () => {
    let now = 0;
    const clock = new NoticeClock(5000, () => now);
    for (let i = 0; i < 10; i++) {
        now += 370;
        clock.setPaused(true);
        now += 250;
        clock.setPaused(true);
        now += 70;
        clock.setPaused(false);
    }
    expect(clock.read()).toBe(1300);
    now += 1300;
    expect(clock.read()).toBe(0);
    clock.setPaused(true);
    clock.reset(5000);
    now += 10000;
    expect(clock.read()).toBe(5000);
    clock.setPaused(false);
    now += 300;
    expect(clock.read()).toBe(4700);
});

test("preview uses only media position and rate, including backwards seeks", () => {
    const video = { currentTime: 7.2, playbackRate: 1 };
    expect(secondsUntilSegment(video, 10)).toBe(3);
    expect(secondsUntilSegment(video, 10)).toBe(3);
    video.playbackRate = 2;
    expect(secondsUntilSegment(video, 10)).toBe(2);
    video.currentTime = 4;
    expect(secondsUntilSegment(video, 10)).toBe(3);
    video.currentTime = 20;
    expect(secondsUntilSegment(video, 10)).toBe(0);
});

test("mute keeps seek and mute actions separate; presentation derives from current playback", () => {
    expect(initialPlayback(true, false, ActionType.Mute)).toEqual([SegmentPlaybackState.Skipped, SegmentPlaybackState.Pending]);
    expect(initialPlayback(false, false, ActionType.Skip)[0]).toBe(SegmentPlaybackState.Pending);
    expect(initialPlayback(true, true, ActionType.Skip)[0]).toBe(SegmentPlaybackState.Undone);
    const mode = NoticeVisibilityMode.FadedForAutoSkip;
    expect(noticePresentation(mode, true, SegmentPlaybackState.Skipped).faded).toBe(false);
    expect(noticePresentation(mode, false, SegmentPlaybackState.Skipped).faded).toBe(true);
    expect(noticePresentation(mode, false, SegmentPlaybackState.Undone).faded).toBe(false);
});

test("collapsing an upper detail does not move lower headers and removing a card fills downward", () => {
    const measurements = [{ header: 40, detailGap: 60 }, { header: 40, detailGap: 60 }, { header: 40, detailGap: 60 }];
    const before = stackOffsets(measurements, 60, 6);
    measurements[2].detailGap = 0;
    const after = stackOffsets(measurements, 60, 6);
    expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
    expect(after[2]).toBe(before[2] - 60);
    expect(stackOffsets(measurements.slice(1), 60, 6)[0]).toBe(60);
});

test("fractional card bounds settle to the same viewport without clipping details", () => {
    // Successive animation frames from a resized compact player. Feeding these
    // fractions back into transforms used to restart the transition indefinitely.
    const viewports = [0.0087, 0.0074, 0.0069].map(fraction => {
        const bounds = { top: 65 + fraction, bottom: 145 + fraction };
        const viewport = occupiedViewport(191, [bounds]);
        expect(viewport.top).toBeLessThanOrEqual(bounds.top);
        expect(191 - viewport.bottom).toBeGreaterThanOrEqual(bounds.bottom);
        return viewport;
    });
    expect(viewports[1]).toEqual(viewports[0]);
    expect(viewports[2]).toEqual(viewports[0]);
    // Expanded bottom details may extend below the normal control-bar boundary.
    expect(occupiedViewport(101, [{ top: 12.4, bottom: 135.2 }], 55))
        .toEqual({ top: 12, bottom: -35 });
});

test("cancelled preview survives rescheduling, only applies to its segment and is consumed once", () => {
    const decisions = new UpcomingSkipDecision();
    decisions.set("video:part1", ["first"], false);
    expect(decisions.consume("video:part1", ["other"])).toBe(false);
    expect(decisions.consume("video:part1", ["first", "merged"])).toBe(true);
    expect(decisions.consume("video:part1", ["first"])).toBe(false);
    decisions.set("video:part1", ["first"], false);
    decisions.set("video:part1", ["first"], true);
    expect(decisions.consume("video:part1", ["first"])).toBe(false);
    decisions.set("video:part1", ["first"], false);
    expect(decisions.consume("video:part2", ["first"])).toBe(false);
});
