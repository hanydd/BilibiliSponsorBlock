import Config from "../config";
import { addCleanupListener } from "../utils/cleanup";
import { logDebug } from "../utils/logger";
import { getVideoID } from "../utils/video";
import { danmakuForSkip } from "./danmakuSkip";
import { createPreviewBar, updateActiveSegment, updatePreviewBar } from "./previewBarManager";
import {
    cancelSponsorSchedule,
    clearWaitingTime,
    getLastKnownVideoTime,
    startSkipScheduleCheckingForStartSponsors,
    startSponsorSchedule,
    updateVirtualTime,
    updateWaitingTime,
} from "./skipScheduler";
import { contentState } from "./state";

// --- Module-private state (formerly on contentState) ---
let lastCheckTime = 0;
let lastCheckVideoTime = -1;

export function resetVideoListenerState(): void {
    lastCheckTime = 0;
    lastCheckVideoTime = -1;
}

export interface VideoListenerDeps {
    updateVisibilityOfPlayerControlsButton: () => Promise<void>;
}

let deps: VideoListenerDeps;

export function initVideoListeners(d: VideoListenerDeps): void {
    deps = d;
}

let playbackRateCheckInterval: NodeJS.Timeout | null = null;
let lastPlaybackSpeed = 1;
let setupVideoListenersFirstTime = true;

/**
 * Triggered every time the video duration changes.
 * This happens when the resolution changes or at random time to clear memory.
 */
export function durationChangeListener(): void {
    updatePreviewBar();
}

/**
 * Triggered once the video is ready.
 * This is mainly to attach to embedded players who don't have a video element visible.
 */
export function videoOnReadyListener(): void {
    createPreviewBar();
    updatePreviewBar();
    deps.updateVisibilityOfPlayerControlsButton();
}

export function setupVideoListeners(video: HTMLVideoElement): void {
    if (!video) return;

    video.addEventListener("loadstart", videoOnReadyListener);
    video.addEventListener("durationchange", durationChangeListener);

    if (setupVideoListenersFirstTime) {
        addCleanupListener(() => {
            video.removeEventListener("loadstart", videoOnReadyListener);
            video.removeEventListener("durationchange", durationChangeListener);
        });
    }

    if (!Config.config.disableSkipping) {
        danmakuForSkip();

        contentState.switchingVideos = false;

        let startedWaiting = false;
        let lastPausedAtZero = true;

        const rateChangeListener = () => {
            updateVirtualTime();
            clearWaitingTime();

            startSponsorSchedule();
        };
        video.addEventListener("ratechange", rateChangeListener);
        video.addEventListener("videoSpeed_ratechange", rateChangeListener);

        const playListener = () => {
            if (video.readyState <= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime === 0) return;

            updateVirtualTime();

            if (contentState.switchingVideos || lastPausedAtZero) {
                contentState.switchingVideos = false;
                logDebug("Setting switching videos to false");

                if (contentState.sponsorTimes) startSkipScheduleCheckingForStartSponsors();
            }

            lastPausedAtZero = false;

            if (
                Math.abs(lastCheckVideoTime - video.currentTime) > 0.3 ||
                (lastCheckVideoTime !== video.currentTime && Date.now() - lastCheckTime > 2000)
            ) {
                lastCheckTime = Date.now();
                lastCheckVideoTime = video.currentTime;

                startSponsorSchedule();
            }
        };
        video.addEventListener("play", playListener);

        const playingListener = () => {
            updateVirtualTime();
            lastPausedAtZero = false;

            if (startedWaiting) {
                startedWaiting = false;
                logDebug(
                    `[SB] Playing event after buffering: ${Math.abs(lastCheckVideoTime - video.currentTime) > 0.3 ||
                    (lastCheckVideoTime !== video.currentTime && Date.now() - lastCheckTime > 2000)
                    }`
                );
            }

            if (contentState.switchingVideos) {
                contentState.switchingVideos = false;
                logDebug("Setting switching videos to false");

                if (contentState.sponsorTimes) startSkipScheduleCheckingForStartSponsors();
            }

            if (
                Math.abs(lastCheckVideoTime - video.currentTime) > 0.3 ||
                (lastCheckVideoTime !== video.currentTime && Date.now() - lastCheckTime > 2000)
            ) {
                lastCheckTime = Date.now();
                lastCheckVideoTime = video.currentTime;

                startSponsorSchedule();
            }

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
        video.addEventListener("playing", playingListener);

        const seekingListener = () => {
            getLastKnownVideoTime().fromPause = false;

            if (!video.paused) {
                lastCheckTime = Date.now();
                lastCheckVideoTime = video.currentTime;

                updateVirtualTime();
                clearWaitingTime();

                if (video.loop && video.currentTime < 0.2) {
                    startSponsorSchedule(false, 0);
                } else {
                    startSponsorSchedule(Config.config.skipOnSeekToSegment);
                }
            } else {
                updateActiveSegment(video.currentTime);

                if (video.currentTime === 0) {
                    lastPausedAtZero = true;
                }
            }
        };
        video.addEventListener("seeking", seekingListener);

        const stoppedPlayback = () => {
            lastCheckVideoTime = -1;
            lastCheckTime = 0;

            if (playbackRateCheckInterval) clearInterval(playbackRateCheckInterval);

            getLastKnownVideoTime().videoTime = null;
            getLastKnownVideoTime().preciseTime = null;
            updateWaitingTime();

            cancelSponsorSchedule();
        };
        const pauseListener = () => {
            getLastKnownVideoTime().fromPause = true;

            stoppedPlayback();
        };
        video.addEventListener("pause", pauseListener);
        const waitingListener = () => {
            logDebug("[SB] Not skipping due to buffering");
            startedWaiting = true;

            stoppedPlayback();
        };
        video.addEventListener("waiting", waitingListener);

        startSponsorSchedule();

        if (setupVideoListenersFirstTime) {
            addCleanupListener(() => {
                video.removeEventListener("play", playListener);
                video.removeEventListener("playing", playingListener);
                video.removeEventListener("seeking", seekingListener);
                video.removeEventListener("ratechange", rateChangeListener);
                video.removeEventListener("videoSpeed_ratechange", rateChangeListener);
                video.removeEventListener("pause", pauseListener);
                video.removeEventListener("waiting", waitingListener);

                if (playbackRateCheckInterval) clearInterval(playbackRateCheckInterval);
            });
        }
    }

    setupVideoListenersFirstTime = false;
}
