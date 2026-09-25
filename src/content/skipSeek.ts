// Seeking events are asynchronous and can be coalesced. Match the destination,
// rather than treating the next event as ours (the user may seek again first).
const skipSeeks = new WeakMap<HTMLVideoElement, { time: number }>();

export function seekForSkip(video: HTMLVideoElement, time: number): void {
    const previousTime = video.currentTime;
    video.currentTime = time;
    if (video.currentTime === previousTime) return;

    const seek = { time: video.currentTime };
    skipSeeks.set(video, seek);
    video.addEventListener("seeked", () => {
        if (skipSeeks.get(video) === seek) skipSeeks.delete(video);
    }, { once: true });
}

export function isSkipSeek(video: HTMLVideoElement): boolean {
    const seek = skipSeeks.get(video);
    if (seek && Math.abs(video.currentTime - seek.time) < 0.25) return true;
    skipSeeks.delete(video);
    return false;
}
