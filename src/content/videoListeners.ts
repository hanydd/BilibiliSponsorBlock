import Config from "../config";
import { addCleanupListener } from "../utils/cleanup";
import { getVideo, getVideoID } from "../utils/video";
import { getContentApp } from "./app";
import { CONTENT_EVENTS } from "./app/events";
import { danmakuForSkip } from "./danmakuSkip";
import { contentState } from "./state";

let playbackRateCheckInterval: NodeJS.Timeout | null = null;
let lastPlaybackSpeed = 1;
let boundVideo: HTMLVideoElement | null = null;
let unbindVideo: (() => void) | null = null;
let cleanupRegistered = false;

export function registerVideoListeners(): void {
    const off = getContentApp().bus.on(CONTENT_EVENTS.VIDEO_ELEMENT_CHANGED, ({ video }) => {
        if (!video) {
            unbindVideo?.();
            return;
        }
        // Content bootstrap already awaited Config.ready. Bind immediately so
        // early media events cannot fall between discovery and registration.
        if (video === getVideo()) setupVideoListeners(video);
    });
    addCleanupListener(off);
}

/**
 * Triggered every time the video duration changes.
 * This happens when the resolution changes or at random time to clear memory.
 */
export function durationChangeListener(event?: Event): void {
    const video = (event?.target as HTMLVideoElement) || (document.querySelector("video") as HTMLVideoElement | null);
    if (!video) return;

    getContentApp().bus.emit(CONTENT_EVENTS.PLAYER_DURATION_CHANGED, { video }, { source: "videoListeners.durationChange" });
}

/**
 * Triggered when a media source starts loading or its metadata becomes ready.
 * This is mainly to attach to embedded players who don't have a video element visible.
 */
export function videoOnReadyListener(event?: Event): void {
    const video = (event?.target as HTMLVideoElement) || (document.querySelector("video") as HTMLVideoElement | null);
    if (!video) return;

    getContentApp().bus.emit(CONTENT_EVENTS.PLAYER_VIDEO_READY, { video }, { source: "videoListeners.videoOnReady" });
}

export function setupVideoListeners(video: HTMLVideoElement): void {
    if (!video || boundVideo === video) return;
    unbindVideo?.();
    boundVideo = video;
    const removers: Array<() => void> = [];
    const listen = (type: string, listener: EventListener) => {
        video.addEventListener(type, listener);
        removers.push(() => video.removeEventListener(type, listener));
    };
    unbindVideo = () => {
        removers.forEach((remove) => remove());
        if (playbackRateCheckInterval) clearInterval(playbackRateCheckInterval);
        playbackRateCheckInterval = null;
        boundVideo = null;
    };
    if (!cleanupRegistered) {
        cleanupRegistered = true;
        addCleanupListener(() => unbindVideo?.());
    }

    const app = getContentApp();

    listen("loadstart", videoOnReadyListener);
    listen("loadedmetadata", videoOnReadyListener);
    listen("durationchange", durationChangeListener);

    if (!Config.config.disableSkipping) {
        danmakuForSkip();

        contentState.switchingVideos = false;

        const rateChangeListener = () => {
            app.bus.emit(CONTENT_EVENTS.PLAYER_RATE_CHANGED, { video, playbackRate: video.playbackRate }, { source: "videoListeners.rateChange" });
        };
        listen("ratechange", rateChangeListener);
        listen("videoSpeed_ratechange", rateChangeListener);

        const playListener = () => {
            if (video.readyState <= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime === 0) return;

            app.bus.emit(CONTENT_EVENTS.PLAYER_PLAY, { video }, { source: "videoListeners.play" });
        };
        listen("play", playListener);

        const playingListener = () => {
            app.bus.emit(CONTENT_EVENTS.PLAYER_PLAYING, { video }, { source: "videoListeners.playing" });

            if (playbackRateCheckInterval) clearInterval(playbackRateCheckInterval);
            lastPlaybackSpeed = video.playbackRate;

            if (document.body.classList.contains("vsc-initialized")) {
                playbackRateCheckInterval = setInterval(() => {
                    if ((!getVideoID() || video.paused) && playbackRateCheckInterval) {
                        clearInterval(playbackRateCheckInterval);
                        return;
                    }

                    if (video.playbackRate !== lastPlaybackSpeed) {
                        lastPlaybackSpeed = video.playbackRate;

                        rateChangeListener();
                    }
                }, 2000);
            }
        };
        listen("playing", playingListener);

        const seekingListener = () => {
            app.bus.emit(CONTENT_EVENTS.PLAYER_SEEKING, { video }, { source: "videoListeners.seeking" });
        };
        listen("seeking", seekingListener);

        const stoppedPlayback = () => {
            if (playbackRateCheckInterval) clearInterval(playbackRateCheckInterval);
        };
        const pauseListener = () => {
            app.bus.emit(CONTENT_EVENTS.PLAYER_PAUSE, { video }, { source: "videoListeners.pause" });

            stoppedPlayback();
        };
        listen("pause", pauseListener);
        const waitingListener = () => {
            app.bus.emit(CONTENT_EVENTS.PLAYER_WAITING, { video }, { source: "videoListeners.waiting" });

            stoppedPlayback();
        };
        listen("waiting", waitingListener);

        void app.commands.execute("skip/startSchedule", {});

    }
}
