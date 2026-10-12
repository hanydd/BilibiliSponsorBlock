import type { PlayerUIReadySnapshot } from "./playerUi";

interface LifecycleOptions {
    capture: () => PlayerUIReadySnapshot;
    isReady: (snapshot: PlayerUIReadySnapshot) => boolean;
    duration: (video: HTMLVideoElement | null) => number;
    ready: (snapshot: PlayerUIReadySnapshot) => void;
    invalidated: () => void;
    timelineChanged: (video: HTMLVideoElement, duration: number) => void;
}

function sameHost(a: PlayerUIReadySnapshot | null, b: PlayerUIReadySnapshot): boolean {
    return !!a && a.video === b.video && a.leftControls === b.leftControls &&
        a.rightControls === b.rightControls && a.progressBar === b.progressBar;
}

/** Owns one host stabilization timer and independent deadlines for every waiter. */
export class PlayerUiLifecycle {
    private candidate: PlayerUIReadySnapshot | null = null;
    private candidateSince = 0;
    private current: PlayerUIReadySnapshot | null = null;
    private timeline: { video: HTMLVideoElement; duration: number } | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private waiters = new Set<{ resolve: (snapshot: PlayerUIReadySnapshot) => void; reject: (error: Error) => void }>();
    private disposed = false;

    constructor(private options: LifecycleOptions) {}

    requestCheck = (): void => {
        if (this.disposed || this.timer !== null) return;
        this.timer = setTimeout(() => { this.timer = null; this.check(); }, 50);
    };

    /** Route resets can clear extension UI while retaining all native player nodes. */
    refresh(): void {
        this.current = null;
        this.candidate = null;
        this.requestCheck();
    }

    private check(): void {
        const snapshot = this.options.capture();
        // An existing shadow/mini timeline still needs updates with collapsed
        // controls. Only UI attachment requires all control hosts to be visible.
        const video = snapshot.video;
        const duration = this.options.duration(video);
        if (snapshot.pageLoaded && video?.isConnected && video.readyState >= HTMLMediaElement.HAVE_METADATA &&
            Number.isFinite(duration) && duration > 0) {
            if (this.timeline?.video !== video || this.timeline?.duration !== duration) {
                this.timeline = { video, duration };
                this.options.timelineChanged(video, duration);
            }
        } else {
            this.timeline = null;
        }
        if (!this.options.isReady(snapshot)) {
            this.candidate = null;
            if (this.current) {
                this.current = null;
                this.options.invalidated();
            }
            return;
        }
        if (!sameHost(this.current, snapshot)) {
            if (!sameHost(this.candidate, snapshot)) {
                this.candidate = snapshot;
                this.candidateSince = Date.now();
                if (this.current) {
                    this.current = null;
                    this.options.invalidated();
                }
            }
            if (Date.now() - this.candidateSince < 150) {
                this.requestCheck();
                return;
            }
            this.current = snapshot;
            this.options.ready(snapshot);
            // Handlers can synchronously reset the route/host. Do not resolve old waiters.
            if (this.current !== snapshot) return;
            for (const waiter of this.waiters) waiter.resolve(snapshot);
        }
    }

    wait(timeout?: number): Promise<PlayerUIReadySnapshot> {
        if (this.disposed) return Promise.reject(new Error("Player UI lifecycle disposed"));
        const snapshot = this.options.capture();
        if (this.current && sameHost(this.current, snapshot) && this.options.isReady(snapshot)) {
            return Promise.resolve(this.current);
        }
        this.requestCheck();
        return new Promise((resolve, reject) => {
            const finish = (snapshot?: PlayerUIReadySnapshot, error?: Error) => {
                clearTimeout(timer);
                this.waiters.delete(waiter);
                if (error) reject(error); else resolve(snapshot);
            };
            const waiter = { resolve: (snapshot: PlayerUIReadySnapshot) => finish(snapshot), reject: (error: Error) => finish(undefined, error) };
            const timer = timeout === undefined ? undefined : setTimeout(() => waiter.reject(new Error("TIMEOUT waiting for stable player UI")), timeout);
            this.waiters.add(waiter);
        });
    }

    dispose(): void {
        this.disposed = true;
        if (this.timer !== null) clearTimeout(this.timer);
        for (const waiter of this.waiters) waiter.reject(new Error("Player UI lifecycle disposed"));
        this.current = this.candidate = null;
    }
}
