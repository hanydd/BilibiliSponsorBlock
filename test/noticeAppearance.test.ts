import { getNoticeAppearance, noticeAppearanceMode } from '../src/notices/noticeAppearance';
import { noticePresentation, SegmentPlaybackState } from '../src/notices/SkipNoticeModel';
import { NoticeVisibilityMode } from '../src/types';

test.each([
    [0, 'never', 'never'], [1, 'handled', 'never'], [2, 'all', 'never'],
    [3, 'all', 'handled'], [4, 'all', 'all'],
] as const)('preserves the stored legacy appearance %i', (mode, collapse, fade) => {
    expect(getNoticeAppearance(mode)).toEqual({ collapse, fade });
    expect(noticeAppearanceMode({ collapse, fade })).toBe(mode);
});

test('collapse and transparency are independent for all playback states', () => {
    const modes = new Set<NoticeVisibilityMode>();
    for (const collapse of ['never', 'handled', 'all'] as const) {
        for (const fade of ['never', 'handled', 'all'] as const) {
            const mode = noticeAppearanceMode({ collapse, fade });
            modes.add(mode);
            expect(getNoticeAppearance(mode)).toEqual({ collapse, fade });
            for (const state of [SegmentPlaybackState.Pending, SegmentPlaybackState.Skipped, SegmentPlaybackState.Undone]) {
                expect(noticePresentation(mode, true, state)).toEqual({ small: collapse === 'all', faded: fade === 'all' });
                const handled = state === SegmentPlaybackState.Skipped;
                expect(noticePresentation(mode, false, state)).toEqual({
                    small: collapse === 'all' || collapse === 'handled' && handled,
                    faded: fade === 'all' || fade === 'handled' && handled,
                });
            }
        }
    }
    expect(modes.size).toBe(9);
});
