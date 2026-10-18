import { getFormattedTimeToSeconds } from "./formating";

/** Read the native seek-bar axis, which can be longer OR shorter than the media. */
export function getPlayerTimelineDuration(video: HTMLVideoElement | null): number {
    const player = video?.closest(".bpx-player-container");
    const label = player?.querySelector(".bpx-player-ctrl-time-duration")?.textContent?.trim();
    return resolveTimelineDuration(video, label);
}

export function resolveTimelineDuration(video: HTMLVideoElement | null, label?: string): number {
    const mediaDuration = Number.isFinite(video?.duration) ? video.duration : 0;
    const displayedDuration = label ? getFormattedTimeToSeconds(label) : 0;
    // The native label can round either up or down. A one-second difference
    // should not discard media precision on ordinary videos.
    return Number.isFinite(displayedDuration) && displayedDuration > 0 &&
        (mediaDuration <= 0 || Math.abs(displayedDuration - mediaDuration) > 1)
        ? displayedDuration : mediaDuration;
}
