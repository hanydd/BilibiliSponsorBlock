import { ActionType, NoticeVisibilityMode } from "../types";

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
    return {
        small: mode >= NoticeVisibilityMode.MiniForAll || (mode >= NoticeVisibilityMode.MiniForAutoSkip && skipped),
        faded: mode >= NoticeVisibilityMode.FadedForAll || (mode >= NoticeVisibilityMode.FadedForAutoSkip && skipped),
    };
}
