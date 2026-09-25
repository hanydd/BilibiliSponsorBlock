/** Elapsed display time, independent of the frequency of UI updates. */
export class NoticeClock {
    private remaining: number;
    private sampledAt: number;
    private paused = false;

    constructor(milliseconds: number, private now: () => number = () => performance.now()) {
        this.reset(milliseconds);
    }

    reset(milliseconds: number): void {
        this.remaining = Math.max(0, milliseconds);
        this.sampledAt = this.now();
    }

    read(limit = Infinity): number {
        const now = this.now();
        if (!this.paused) this.remaining = Math.max(0, Math.min(limit, this.remaining - (now - this.sampledAt)));
        this.sampledAt = now;
        return this.remaining;
    }

    setPaused(paused: boolean): void {
        this.read();
        this.paused = paused;
    }
}

/** Never extrapolate across pauses, buffering or seeks. The media clock is authoritative. */
export function secondsUntilSegment(video: Pick<HTMLVideoElement, "currentTime" | "playbackRate">, start: number): number {
    return Math.ceil(Math.max(0, start - video.currentTime) / Math.max(0.01, video.playbackRate));
}
