import { ActionType, NoticeVisibilityMode } from "../types";
import { getNoticeAppearance, NoticeAppearanceScope } from './noticeAppearance';

export enum SegmentPlaybackState {
    Skipped,
    Undone,
    Pending,
}

/** Two actions only for mute segments: mute/unmute and optionally seek past them. */
export function initialPlayback(autoSkip: boolean, startReskip: boolean, action: ActionType): SegmentPlaybackState[] {
    const primary = startReskip ? SegmentPlaybackState.Undone : autoSkip ? SegmentPlaybackState.Skipped : SegmentPlaybackState.Pending;
    return [primary, action === ActionType.Mute ? SegmentPlaybackState.Pending : primary];
}

export function noticePresentation(mode: NoticeVisibilityMode, upcoming: boolean, playback: SegmentPlaybackState): { small: boolean; faded: boolean } {
    const skipped = !upcoming && playback === SegmentPlaybackState.Skipped;
    const appearance = getNoticeAppearance(mode);
    const applies = (scope: NoticeAppearanceScope) => scope === 'all' || scope === 'handled' && skipped;
    return {
        small: applies(appearance.collapse),
        faded: applies(appearance.fade),
    };
}
