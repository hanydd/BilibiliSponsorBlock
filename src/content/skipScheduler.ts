import Config from "../config";
import { asyncRequestToServer } from "../requests/requests";
import {
    ActionType,
    CategorySkipOption,
    ChannelIDStatus,
    ScheduledTime,
    SkipToTimeParams,
    SponsorHideType,
    SponsorSourceType,
    SponsorTime,
} from "../types";
import Utils from "../utils";
import { isFirefox, isFirefoxOrSafari, isSafari, waitFor } from "../utils/";
import { GenericUtils } from "../utils/genericUtils";
import { logDebug, logUiLifecycle } from "../utils/logger";
import { isPlayingPlaylist } from "../utils/pageUtils";
import { getBilibiliVideoID } from "../utils/parseVideoID";
import { getStartTimeFromUrl } from "../utils/urlParser";
import {
    checkIfNewVideoID,
    checkVideoIDChange,
    getChannelIDInfo,
    getVideo,
    getVideoID,
} from "../utils/video";
import { getContentApp } from "./app";
import { CONTENT_EVENTS } from "./app/events";
import {
    contentState,
    endTimeSkipBuffer,
    manualSkipPercentCount,
    skipBuffer,
} from "./state";
import { cancelSpeedUp, isSpeedUpActive, shouldUseSpeedUp, startSpeedUp } from "./speedUpManager";

const utils = new Utils();

// --- Module-private state (formerly on contentState) ---
let currentSkipSchedule: NodeJS.Timeout = null;
let currentSkipInterval: NodeJS.Timeout = null;
let currentVirtualTimeInterval: NodeJS.Timeout = null;
let currentAdvanceSkipSchedule: NodeJS.Timeout = null;
let lastTimeFromWaitingEvent: number = null;
let lastCheckTime = 0;
let lastCheckVideoTime = -1;
let startedWaiting = false;
let lastPausedAtZero = true;
let videoMuted = false;
const lastKnownVideoTime: { videoTime: number; preciseTime: number; fromPause: boolean; approximateDelay: number } = {
    videoTime: null,
    preciseTime: null,
    fromPause: false,
    approximateDelay: null,
};
let sponsorSkipped: boolean[] = [];

export function getLastKnownVideoTime() { return lastKnownVideoTime; }
export function getSponsorSkipped() { return sponsorSkipped; }
export function resetSponsorSkipped() { sponsorSkipped = []; }

export function resetSchedulerState(): void {
    if (currentSkipSchedule !== null) {
        clearTimeout(currentSkipSchedule);
        currentSkipSchedule = null;
    }
    if (currentSkipInterval !== null) {
        clearInterval(currentSkipInterval);
        currentSkipInterval = null;
    }
    if (currentVirtualTimeInterval !== null) {
        clearInterval(currentVirtualTimeInterval);
        currentVirtualTimeInterval = null;
    }
    if (currentAdvanceSkipSchedule !== null) {
        clearTimeout(currentAdvanceSkipSchedule);
        currentAdvanceSkipSchedule = null;
    }
    lastTimeFromWaitingEvent = null;
    lastCheckTime = 0;
    lastCheckVideoTime = -1;
    startedWaiting = false;
    lastPausedAtZero = true;
    videoMuted = false;
    lastKnownVideoTime.videoTime = null;
    lastKnownVideoTime.preciseTime = null;
    lastKnownVideoTime.fromPause = false;
    lastKnownVideoTime.approximateDelay = null;
    sponsorSkipped = [];
}

function getCategoryPill() {
    return getContentApp().ui.getState().categoryPill;
}

function emitSkipNoticeRequested(
    noticeKind: "skip" | "advance",
    skippingSegments: SponsorTime[],
    autoSkip: boolean,
    unskipTime: number | null | undefined,
    startReskip: boolean,
    source: string
): void {
    getContentApp().bus.emit(
        CONTENT_EVENTS.SKIP_NOTICE_REQUESTED,
        {
            noticeKind,
            skippingSegments,
            autoSkip,
            unskipTime,
            startReskip,
        },
        { source }
    );
}

function emitSkipButtonStateChanged(enabled: boolean, segment: SponsorTime | null, duration: number | undefined, source: string): void {
    getContentApp().bus.emit(
        CONTENT_EVENTS.SKIP_BUTTON_STATE_CHANGED,
        {
            enabled,
            segment,
            duration,
        },
        { source }
    );
}

function emitSkipExecuted(
    skipTime: [number, number],
    skippingSegments: SponsorTime[],
    autoSkip: boolean,
    openNotice: boolean,
    unskipTime: number | null | undefined,
    source: string
): void {
    getContentApp().bus.emit(
        CONTENT_EVENTS.SKIP_EXECUTED,
        {
            skipTime,
            skippingSegments,
            autoSkip,
            openNotice,
            unskipTime,
        },
        { source }
    );
}

export function registerSkipScheduler(): void {
    const app = getContentApp();

    app.commands.register("skip/startSchedule", ({ includeIntersectingSegments, currentTime, includeNonIntersectingSegments }) =>
        startSponsorSchedule(includeIntersectingSegments, currentTime, includeNonIntersectingSegments)
    );
    app.commands.register("skip/checkStartSponsors", () => startSkipScheduleCheckingForStartSponsors());
    app.commands.register("skip/unskip", ({ segment, unskipTime, forceSeek }) => unskipSponsorTime(segment, unskipTime, forceSeek));
    app.commands.register("skip/reskip", ({ segment, forceSeek }) => reskipSponsorTime(segment, forceSeek));
    app.commands.register("skip/execute", (payload) => skipToTime(payload));
    app.commands.register("skip/previewTime", ({ time, unpause }) => previewTime(time, unpause));
    app.commands.register("skip/updateVirtualTime", () => updateVirtualTime());
    app.commands.register("skip/updateWaitingTime", () => updateWaitingTime());
    app.commands.register("skip/clearWaitingTime", () => clearWaitingTime());
    app.commands.register("skip/cancelSchedule", () => cancelSponsorSchedule());
    app.commands.register("skip/getVirtualTime", () => getVirtualTime());
    app.commands.register("skip/getLastKnownVideoTime", () => getLastKnownVideoTime());
    app.commands.register("skip/getSponsorSkipped", () => getSponsorSkipped());
    app.commands.register("skip/isSegmentMarkedNearCurrentTime", ({ currentTime, range }) =>
        isSegmentMarkedNearCurrentTime(currentTime, range)
    );

    app.bus.on(CONTENT_EVENTS.SEGMENTS_LOADED, ({ sponsorTimes, videoID }) => {
        if (videoID !== getVideoID()) {
            return;
        }

        updatePoiSkipButtonForCurrentTime();
        if (sponsorTimes.length === 0) {
            return;
        }

        startSkipScheduleCheckingForStartSponsors();
    });
    app.bus.on(CONTENT_EVENTS.SEGMENTS_SUBMITTING_CHANGED, ({ videoID }) => {
        if (videoID !== getVideoID() || getVideo() === null) {
            return;
        }

        void startSponsorSchedule();
    });
    app.bus.on(CONTENT_EVENTS.PLAYER_VIDEO_READY, () => {
        updatePoiSkipButtonForCurrentTime();
    });
    app.bus.on(CONTENT_EVENTS.PLAYER_RATE_CHANGED, () => {
        updateVirtualTime();
        clearWaitingTime();
        void startSponsorSchedule();
    });
    app.bus.on(CONTENT_EVENTS.PLAYER_PLAY, ({ video }) => {
        updateVirtualTime();

        if (contentState.switchingVideos || lastPausedAtZero) {
            setSwitchingVideosFinished();
            if (contentState.sponsorTimes) {
                startSkipScheduleCheckingForStartSponsors();
            }
        }

        lastPausedAtZero = false;
        scheduleIfPlaybackMoved(video);
    });
    app.bus.on(CONTENT_EVENTS.PLAYER_PLAYING, ({ video }) => {
        updateVirtualTime();
        lastPausedAtZero = false;

        if (startedWaiting) {
            startedWaiting = false;
            logDebug(`[SB] Playing event after buffering: ${shouldRefreshPlaybackSchedule(video)}`);
        }

        if (contentState.switchingVideos) {
            setSwitchingVideosFinished();
            if (contentState.sponsorTimes) {
                startSkipScheduleCheckingForStartSponsors();
            }
        }

        scheduleIfPlaybackMoved(video);
    });
    app.bus.on(CONTENT_EVENTS.PLAYER_SEEKING, ({ video }) => {
        lastKnownVideoTime.fromPause = false;
        updatePoiSkipButtonForCurrentTime();

        if (!video.paused) {
            lastCheckTime = Date.now();
            lastCheckVideoTime = video.currentTime;

            updateVirtualTime();
            clearWaitingTime();

            if (video.loop && video.currentTime < 0.2) {
                void startSponsorSchedule(false, 0);
            } else {
                void startSponsorSchedule(Config.config.skipOnSeekToSegment);
            }
        } else {
            void getContentApp().commands.execute("ui/updateActiveSegment", { currentTime: video.currentTime });

            if (video.currentTime === 0) {
                lastPausedAtZero = true;
            }
        }
    });
    app.bus.on(CONTENT_EVENTS.PLAYER_PAUSE, ({ video }) => {
        lastKnownVideoTime.fromPause = true;
        stopPlaybackScheduling(video);
    });
    app.bus.on(CONTENT_EVENTS.PLAYER_WAITING, ({ video }) => {
        logDebug("[SB] Not skipping due to buffering");
        startedWaiting = true;
        stopPlaybackScheduling(video);
    });
}

function setSwitchingVideosFinished(): void {
    contentState.switchingVideos = false;
    logDebug("Setting switching videos to false");
}

function shouldRefreshPlaybackSchedule(video: HTMLVideoElement): boolean {
    return (
        Math.abs(lastCheckVideoTime - video.currentTime) > 0.3 ||
        (lastCheckVideoTime !== video.currentTime && Date.now() - lastCheckTime > 2000)
    );
}

function scheduleIfPlaybackMoved(video: HTMLVideoElement): void {
    if (!shouldRefreshPlaybackSchedule(video)) {
        return;
    }

    lastCheckTime = Date.now();
    lastCheckVideoTime = video.currentTime;

    void startSponsorSchedule();
}

function stopPlaybackScheduling(video: HTMLVideoElement): void {
    lastCheckVideoTime = -1;
    lastCheckTime = 0;

    lastKnownVideoTime.videoTime = null;
    lastKnownVideoTime.preciseTime = null;
    updateWaitingTime(video);

    cancelSponsorSchedule();
}

export function cancelSponsorSchedule(): void {
    logDebug("Pausing skipping");

    if (currentSkipSchedule !== null) {
        clearTimeout(currentSkipSchedule);
        currentSkipSchedule = null;
    }

    if (currentSkipInterval !== null) {
        clearInterval(currentSkipInterval);
        currentSkipInterval = null;
    }

    if (currentAdvanceSkipSchedule !== null) {
        clearInterval(currentAdvanceSkipSchedule);
        currentAdvanceSkipSchedule = null;
    }
}

/**
 * @param currentTime Optional if you don't want to use the actual current time
 */
export async function startSponsorSchedule(
    includeIntersectingSegments = false,
    currentTime?: number,
    includeNonIntersectingSegments = true
): Promise<void> {
    cancelSponsorSchedule();

    // Give up if video changed, and trigger a videoID change if so
    if (await checkIfNewVideoID()) {
        return;
    }

    const video = getVideo();
    logDebug(`Considering to start skipping: ${!video}, ${video?.paused}`);
    if (!video) return;
    if (currentTime === undefined || currentTime === null) {
        currentTime = getVirtualTime();
    }
    clearWaitingTime();

    void getContentApp().commands.execute("ui/updateActiveSegment", { currentTime });

    if (video.paused || (video.currentTime >= video.duration - 0.01 && video.duration > 1)) return;
    const skipInfo = getNextSkipIndex(currentTime, includeIntersectingSegments, includeNonIntersectingSegments);

    const currentSkip = skipInfo.array[skipInfo.index];
    const skipTime: number[] = [currentSkip?.scheduledTime, skipInfo.array[skipInfo.endIndex]?.segment[1]];
    const timeUntilSponsor = skipTime?.[0] - currentTime;
    const videoID = getVideoID();

    if (
        videoMuted &&
        !inMuteSegment(
            currentTime,
            skipInfo.index !== -1 && timeUntilSponsor < skipBuffer && shouldAutoSkip(currentSkip)
        )
    ) {
        video.muted = false;
        videoMuted = false;

        for (const notice of contentState.skipNotices) {
            notice.unmutedListener(currentTime);
        }
    }

    logDebug(`Ready to start skipping: ${skipInfo.index} at ${currentTime}`);
    if (skipInfo.index === -1) return;

    if (
        Config.config.disableSkipping ||
        contentState.channelWhitelisted ||
        (getChannelIDInfo().status === ChannelIDStatus.Fetching && Config.config.forceChannelCheck)
    ) {
        return;
    }

    if (await incorrectVideoCheck()) return;

    // Find all indexes in between the start and end
    let skippingSegments = [skipInfo.array[skipInfo.index]];
    if (skipInfo.index !== skipInfo.endIndex) {
        skippingSegments = [];

        for (const segment of skipInfo.array) {
            if (
                shouldAutoSkip(segment) &&
                segment.segment[0] >= skipTime[0] &&
                segment.segment[1] <= skipTime[1] &&
                segment.segment[0] === segment.scheduledTime
            ) {
                skippingSegments.push(segment);
            }
        }
    }

    logDebug(
        `Next step in starting skipping: ${!shouldSkip(currentSkip)}, ${!contentState.sponsorTimesSubmitting?.some(
            (segment) => segment.segment === currentSkip.segment
        )}`
    );

    const skippingFunction = async (forceVideoTime?: number) => {
        let forcedSkipTime: number = null;
        let forcedIncludeIntersectingSegments = false;
        let forcedIncludeNonIntersectingSegments = true;

        if (await incorrectVideoCheck(videoID, currentSkip)) return;
        forceVideoTime ||= Math.max(getVideo().currentTime, getVirtualTime());

        if (
            shouldSkip(currentSkip) ||
            contentState.sponsorTimesSubmitting?.some((segment) => segment.segment === currentSkip.segment)
        ) {
            if (forceVideoTime >= skipTime[0] - skipBuffer && forceVideoTime < skipTime[1]) {
                const wasSpeedUpBefore = isSpeedUpActive();
                skipToTime({
                    v: getVideo(),
                    skipTime,
                    skippingSegments,
                    openNotice: skipInfo.openNotice,
                });

                // If speedUp was triggered, don't treat as instant skip – let speedUpManager handle progression
                const isNowSpeedUp = isSpeedUpActive();
                if (isNowSpeedUp && !wasSpeedUpBefore) {
                    logDebug(`[SB] SpeedUp started for ${skipTime[0]} -> ${skipTime[1]}, deferring next schedule to speedUpManager`);
                    return;
                }

                for (const extra of skipInfo.extraIndexes) {
                    const extraSkip = skipInfo.array[extra];
                    if (shouldSkip(extraSkip)) {
                        const extraWasSpeedUp = isSpeedUpActive();
                        skipToTime({
                            v: getVideo(),
                            skipTime: [extraSkip.scheduledTime, extraSkip.segment[1]],
                            skippingSegments: [extraSkip],
                            openNotice: skipInfo.openNotice,
                        });
                        if (isSpeedUpActive() && !extraWasSpeedUp) {
                            logDebug(`[SB] SpeedUp started for extra ${extraSkip.scheduledTime} -> ${extraSkip.segment[1]}`);
                            return;
                        }
                    }
                }

                if (
                    utils.getCategorySelection(currentSkip.category)?.option === CategorySkipOption.ManualSkip ||
                    currentSkip.actionType === ActionType.Mute
                ) {
                    forcedSkipTime = skipTime[0] + 0.001;
                } else {
                    forcedSkipTime = skipTime[1];
                    forcedIncludeNonIntersectingSegments = false;

                    if (Math.abs(skipTime[1] - getVideo().duration) > endTimeSkipBuffer) {
                        forcedIncludeIntersectingSegments = true;
                    }
                }
            } else {
                forcedSkipTime = forceVideoTime + 0.001;
            }
        } else {
            forcedSkipTime = forceVideoTime + 0.001;
        }

        if (forcedSkipTime !== null && forceVideoTime > forcedSkipTime) {
            forcedSkipTime = forceVideoTime;
        }

        startSponsorSchedule(forcedIncludeIntersectingSegments, forcedSkipTime, forcedIncludeNonIntersectingSegments);
    };

    if (timeUntilSponsor < skipBuffer) {
        await skippingFunction(currentTime);
    } else {
        let delayTime = (timeUntilSponsor * 1000) / getVideo().playbackRate;
        if (delayTime < (isFirefox() ? 750 : 300) && shouldAutoSkip(skippingSegments[0])) {
            let forceStartIntervalTime: number | null = null;
            if (isFirefox() && delayTime > 300) {
                forceStartIntervalTime = await waitForNextTimeChange();
            }

            const startIntervalTime = forceStartIntervalTime || performance.now();
            const startVideoTime = Math.max(currentTime, getVideo().currentTime);
            delayTime = (skipTime?.[0] - startVideoTime) * 1000 * (1 / getVideo().playbackRate);

            let startWaitingForReportedTimeToChange = true;
            const reportedVideoTimeAtStart = getVideo().currentTime;
            logDebug(`Starting setInterval skipping ${getVideo().currentTime} to skip at ${skipTime[0]}`);

            if (currentSkipInterval !== null) clearInterval(currentSkipInterval);
            currentSkipInterval = setInterval(() => {
                if (
                    isFirefoxOrSafari() &&
                    !lastKnownVideoTime.fromPause &&
                    startWaitingForReportedTimeToChange &&
                    reportedVideoTimeAtStart !== getVideo().currentTime
                ) {
                    startWaitingForReportedTimeToChange = false;
                    const delay = getVirtualTime() - getVideo().currentTime;
                    if (delay > 0) lastKnownVideoTime.approximateDelay = delay;
                }

                const intervalDuration = performance.now() - startIntervalTime;
                if (intervalDuration + skipBuffer * 1000 >= delayTime || getVideo().currentTime >= skipTime[0]) {
                    clearInterval(currentSkipInterval);
                    if (!isFirefoxOrSafari() && !getVideo().muted && !inMuteSegment(getVideo().currentTime, true)) {
                        getVideo().muted = true;
                        getVideo().muted = false;
                    }

                    skippingFunction(
                        Math.max(
                            getVideo().currentTime,
                            startVideoTime + (getVideo().playbackRate * Math.max(delayTime, intervalDuration)) / 1000
                        )
                    );
                }
            }, 0);
        } else {
            logDebug(`Starting timeout to skip ${getVideo().currentTime} to skip at ${skipTime[0]}`);

            const offset = isFirefoxOrSafari() && !isSafari() ? 600 : 150;
            const offsetDelayTime = Math.max(0, delayTime - offset);
            currentSkipSchedule = setTimeout(skippingFunction, offsetDelayTime);

            if (
                Config.config.advanceSkipNotice &&
                Config.config.skipNoticeDurationBefore > 0 &&
                getVideo().currentTime < skippingSegments[0].segment[0] &&
                !contentState.sponsorTimesSubmitting?.some((segment) => segment.segment === currentSkip.segment) &&
                [ActionType.Skip, ActionType.Mute].includes(skippingSegments[0].actionType) &&
                shouldAutoSkip(skippingSegments[0]) &&
                !getVideo()?.paused
            ) {
                const maxPopupTime = Config.config.skipNoticeDurationBefore * 1000;
                const timeUntilPopup = Math.max(0, offsetDelayTime - maxPopupTime);
                const autoSkip = shouldAutoSkip(skippingSegments[0]);

                if (currentAdvanceSkipSchedule) clearTimeout(currentAdvanceSkipSchedule);
                currentAdvanceSkipSchedule = setTimeout(() => {
                    emitSkipNoticeRequested(
                        "advance",
                        [skippingSegments[0]],
                        autoSkip,
                        skipTime[0],
                        false,
                        "skipScheduler.startSponsorSchedule.advanceNotice"
                    );
                    sessionStorage.setItem("SKIPPING", "true");
                }, timeUntilPopup);
            }
        }
    }
}

/**
 * Used on Firefox only, waits for the next animation frame until
 * the video time has changed
 */
function waitForNextTimeChange(): Promise<DOMHighResTimeStamp | null> {
    return new Promise((resolve) => {
        getVideo().addEventListener("timeupdate", () => resolve(performance.now()), { once: true });
    });
}

export function getVirtualTime(): number {
    const virtualTime =
        lastTimeFromWaitingEvent ??
        (lastKnownVideoTime.videoTime !== null
            ? ((performance.now() - lastKnownVideoTime.preciseTime) * getVideo().playbackRate) / 1000 +
            lastKnownVideoTime.videoTime
            : null);

    if (
        Config.config.useVirtualTime &&
        !isSafari() &&
        virtualTime &&
        Math.abs(virtualTime - getVideo().currentTime) < 0.2 &&
        getVideo().currentTime !== 0
    ) {
        return Math.max(virtualTime, getVideo().currentTime);
    } else {
        return getVideo().currentTime;
    }
}

export function updateVirtualTime(): void {
    if (currentVirtualTimeInterval) clearInterval(currentVirtualTimeInterval);

    lastKnownVideoTime.videoTime = getVideo().currentTime;
    lastKnownVideoTime.preciseTime = performance.now();

    // If on Firefox, wait for the second time change (time remains fixed for many "frames" for privacy reasons)
    if (isFirefoxOrSafari()) {
        let count = 0;
        let rawCount = 0;
        let lastTime = lastKnownVideoTime.videoTime;
        let lastPerformanceTime = performance.now();

        currentVirtualTimeInterval = setInterval(() => {
            const frameTime = performance.now() - lastPerformanceTime;
            if (lastTime !== getVideo().currentTime) {
                rawCount++;

                if (frameTime < 20 || rawCount > 30) {
                    count++;
                }
                lastTime = getVideo().currentTime;
            }

            if (count > 1) {
                const delay =
                    lastKnownVideoTime.fromPause && lastKnownVideoTime.approximateDelay
                        ? lastKnownVideoTime.approximateDelay
                        : 0;

                lastKnownVideoTime.videoTime = getVideo().currentTime + delay;
                lastKnownVideoTime.preciseTime = performance.now();

                clearInterval(currentVirtualTimeInterval);
                currentVirtualTimeInterval = null;
            }

            lastPerformanceTime = performance.now();
        }, 1);
    }
}

export function updateWaitingTime(video = getVideo()): void {
    lastTimeFromWaitingEvent = video.currentTime;
}

export function clearWaitingTime(): void {
    lastTimeFromWaitingEvent = null;
}

export function inMuteSegment(currentTime: number, includeOverlap: boolean): boolean {
    const checkFunction = (segment) =>
        segment.actionType === ActionType.Mute &&
        segment.hidden === SponsorHideType.Visible &&
        segment.segment[0] <= currentTime &&
        (segment.segment[1] > currentTime || (includeOverlap && segment.segment[1] + 0.02 > currentTime));
    return contentState.sponsorTimes?.some(checkFunction) || contentState.sponsorTimesSubmitting.some(checkFunction);
}

export function isSegmentMarkedNearCurrentTime(currentTime: number, range: number = 5): boolean {
    const lowerBound = currentTime - range;
    const upperBound = currentTime + range;

    return contentState.sponsorTimes?.some((sponsorTime) => {
        const {
            segment: [startTime, endTime],
        } = sponsorTime;
        return startTime <= upperBound && endTime >= lowerBound;
    });
}

/**
 * This makes sure the videoID is still correct and if the sponsorTime is included
 */
export async function incorrectVideoCheck(videoID?: string, sponsorTime?: SponsorTime): Promise<boolean> {
    const currentVideoID = await getBilibiliVideoID();
    const recordedVideoID = videoID || getVideoID();
    if (
        currentVideoID !== recordedVideoID ||
        (sponsorTime &&
            (!contentState.sponsorTimes ||
                !contentState.sponsorTimes?.some(
                    (time) => time.segment[0] === sponsorTime.segment[0] && time.segment[1] === sponsorTime.segment[1]
                )) &&
            !contentState.sponsorTimesSubmitting.some(
                (time) => time.segment[0] === sponsorTime.segment[0] && time.segment[1] === sponsorTime.segment[1]
            ))
    ) {
        console.error("[SponsorBlock] The videoID recorded when trying to skip is different than what it should be.");
        console.error("[SponsorBlock] VideoID recorded: " + recordedVideoID + ". Actual VideoID: " + currentVideoID);
        console.error(
            "[SponsorBlock] SponsorTime",
            sponsorTime,
            "sponsorTimes",
            contentState.sponsorTimes,
            "sponsorTimesSubmitting",
            contentState.sponsorTimesSubmitting
        );

        checkVideoIDChange();

        return true;
    } else {
        return false;
    }
}

/**
 * Returns info about the next upcoming sponsor skip
 */
function getNextSkipIndex(
    currentTime: number,
    includeIntersectingSegments: boolean,
    includeNonIntersectingSegments: boolean
): { array: ScheduledTime[]; index: number; endIndex: number; extraIndexes: number[]; openNotice: boolean } {
    const autoSkipSorter = (segment: ScheduledTime) => {
        const skipOption = utils.getCategorySelection(segment.category)?.option;
        if (
            (skipOption === CategorySkipOption.AutoSkip || shouldAutoSkip(segment)) &&
            segment.actionType === ActionType.Skip
        ) {
            return 0;
        } else if (skipOption !== CategorySkipOption.ShowOverlay) {
            return 1;
        } else {
            return 2;
        }
    };

    const { includedTimes: submittedArray, scheduledTimes: sponsorStartTimes } = getStartTimes(
        contentState.sponsorTimes,
        includeIntersectingSegments,
        includeNonIntersectingSegments
    );
    const { scheduledTimes: sponsorStartTimesAfterCurrentTime } = getStartTimes(
        contentState.sponsorTimes,
        includeIntersectingSegments,
        includeNonIntersectingSegments,
        currentTime,
        true
    );

    const minSponsorTimeIndexes = GenericUtils.indexesOf(
        sponsorStartTimes,
        Math.min(...sponsorStartTimesAfterCurrentTime)
    );
    const minSponsorTimeIndex =
        minSponsorTimeIndexes.sort(
            (a, b) =>
                autoSkipSorter(submittedArray[a]) - autoSkipSorter(submittedArray[b]) ||
                submittedArray[a].segment[1] -
                submittedArray[a].segment[0] -
                (submittedArray[b].segment[1] - submittedArray[b].segment[0])
        )[0] ?? -1;
    const extraIndexes = minSponsorTimeIndexes.filter(
        (i) => i !== minSponsorTimeIndex && autoSkipSorter(submittedArray[i]) !== 0
    );

    const endTimeIndex = getLatestEndTimeIndex(submittedArray, minSponsorTimeIndex);

    const { includedTimes: unsubmittedArray, scheduledTimes: unsubmittedSponsorStartTimes } = getStartTimes(
        contentState.sponsorTimesSubmitting,
        includeIntersectingSegments,
        includeNonIntersectingSegments
    );
    const { scheduledTimes: unsubmittedSponsorStartTimesAfterCurrentTime } = getStartTimes(
        contentState.sponsorTimesSubmitting,
        includeIntersectingSegments,
        includeNonIntersectingSegments,
        currentTime,
        false
    );

    const minUnsubmittedSponsorTimeIndex = unsubmittedSponsorStartTimes.indexOf(
        Math.min(...unsubmittedSponsorStartTimesAfterCurrentTime)
    );
    const previewEndTimeIndex = getLatestEndTimeIndex(unsubmittedArray, minUnsubmittedSponsorTimeIndex);

    if (
        (minUnsubmittedSponsorTimeIndex === -1 && minSponsorTimeIndex !== -1) ||
        sponsorStartTimes[minSponsorTimeIndex] < unsubmittedSponsorStartTimes[minUnsubmittedSponsorTimeIndex]
    ) {
        return {
            array: submittedArray,
            index: minSponsorTimeIndex,
            endIndex: endTimeIndex,
            extraIndexes,
            openNotice: true,
        };
    } else {
        return {
            array: unsubmittedArray,
            index: minUnsubmittedSponsorTimeIndex,
            endIndex: previewEndTimeIndex,
            extraIndexes: [],
            openNotice: false,
        };
    }
}

/**
 * This returns index if the skip option is not AutoSkip
 *
 * Finds the last endTime that occurs in a segment that the given
 * segment skips into that is part of an AutoSkip category.
 *
 * Used to find where a segment should truely skip to if there are intersecting submissions due to
 * them having different categories.
 */
function getLatestEndTimeIndex(sponsorTimes: SponsorTime[], index: number, hideHiddenSponsors = true): number {
    if (index == -1 || !shouldAutoSkip(sponsorTimes[index]) || sponsorTimes[index].actionType !== ActionType.Skip) {
        return index;
    }

    let latestEndTimeIndex = index;

    for (let i = 0; i < sponsorTimes?.length; i++) {
        const currentSegment = sponsorTimes[i].segment;
        const latestEndTime = sponsorTimes[latestEndTimeIndex].segment[1];

        if (
            currentSegment[0] - skipBuffer <= latestEndTime &&
            currentSegment[1] > latestEndTime &&
            (!hideHiddenSponsors || sponsorTimes[i].hidden === SponsorHideType.Visible) &&
            shouldAutoSkip(sponsorTimes[i]) &&
            sponsorTimes[i].actionType === ActionType.Skip
        ) {
            latestEndTimeIndex = i;
        }
    }

    if (latestEndTimeIndex !== index) {
        latestEndTimeIndex = getLatestEndTimeIndex(sponsorTimes, latestEndTimeIndex, hideHiddenSponsors);
    }

    return latestEndTimeIndex;
}

/**
 * Gets just the start times from a sponsor times array.
 * Optionally specify a minimum
 */
function getStartTimes(
    sponsorTimes: SponsorTime[],
    includeIntersectingSegments: boolean,
    includeNonIntersectingSegments: boolean,
    minimum?: number,
    hideHiddenSponsors = false
): { includedTimes: ScheduledTime[]; scheduledTimes: number[] } {
    if (!sponsorTimes) return { includedTimes: [], scheduledTimes: [] };

    const includedTimes: ScheduledTime[] = [];
    const scheduledTimes: number[] = [];

    const shouldIncludeTime = (segment: ScheduledTime) =>
        (minimum === undefined ||
            (includeNonIntersectingSegments && segment.scheduledTime >= minimum) ||
            (includeIntersectingSegments &&
                segment.scheduledTime < minimum &&
                segment.segment[1] > minimum &&
                shouldSkip(segment))) &&
        (!hideHiddenSponsors || segment.hidden === SponsorHideType.Visible) &&
        segment.segment.length === 2 &&
        segment.actionType !== ActionType.Poi &&
        segment.actionType !== ActionType.Full;

    const possibleTimes = sponsorTimes.map((sponsorTime) => ({
        ...sponsorTime,
        scheduledTime: sponsorTime.segment[0],
    }));

    sponsorTimes.forEach((sponsorTime) => {
        if (
            !possibleTimes.some((time) => sponsorTime.segment[1] === time.scheduledTime && shouldIncludeTime(time)) &&
            (minimum === undefined || sponsorTime.segment[1] > minimum)
        ) {
            possibleTimes.push({
                ...sponsorTime,
                scheduledTime: sponsorTime.segment[1],
            });
        }
    });

    for (let i = 0; i < possibleTimes.length; i++) {
        if (shouldIncludeTime(possibleTimes[i])) {
            scheduledTimes.push(possibleTimes[i].scheduledTime);
            includedTimes.push(possibleTimes[i]);
        }
    }

    return { includedTimes, scheduledTimes };
}

export function previewTime(time: number, unpause = true): void {
    contentState.previewedSegment = true;
    getVideo().currentTime = time;

    if (unpause && getVideo().paused) {
        getVideo().play();
    }
}

function sendTelemetryAndCount(skippingSegments: SponsorTime[], secondsSkipped: number, fullSkip: boolean): void {
    for (const segment of skippingSegments) {
        if (!contentState.previewedSegment && contentState.sponsorTimesSubmitting.some((s) => s.segment === segment.segment)) {
            contentState.previewedSegment = true;
        }
    }

    if (
        !Config.config.trackViewCount ||
        (!Config.config.trackViewCountInPrivate && chrome.extension.inIncognitoContext)
    )
        return;

    let counted = false;
    for (const segment of skippingSegments) {
        const index = contentState.sponsorTimes?.findIndex((s) => s.segment === segment.segment);
        if (index !== -1 && !sponsorSkipped[index]) {
            sponsorSkipped[index] = true;
            if (!counted) {
                Config.config.minutesSaved = Config.config.minutesSaved + secondsSkipped / 60;
                Config.config.skipCount = Config.config.skipCount + 1;
                counted = true;
            }

            if (fullSkip) asyncRequestToServer("POST", "/api/viewedVideoSponsorTime?UUID=" + segment.UUID);
        }
    }
}

/**
 * Only should be used when it is okay to skip a sponsor when in the middle of it
 *
 * Ex. When segments are first loaded
 */
export function startSkipScheduleCheckingForStartSponsors(): void {
    // switchingVideos is ignored in Safari due to event fire order. See #1142
    if ((!contentState.switchingVideos || isSafari()) && contentState.sponsorTimes) {
        let startingSegmentTime = getStartTimeFromUrl(document.URL) || -1;
        let found = false;
        for (const time of contentState.sponsorTimes) {
            if (
                time.segment[0] <= getVideo().currentTime &&
                time.segment[0] > startingSegmentTime &&
                time.segment[1] > getVideo().currentTime &&
                time.actionType !== ActionType.Poi
            ) {
                startingSegmentTime = time.segment[0];
                found = true;
                break;
            }
        }
        if (!found) {
            for (const time of contentState.sponsorTimesSubmitting) {
                if (
                    time.segment[0] <= getVideo().currentTime &&
                    time.segment[0] > startingSegmentTime &&
                    time.segment[1] > getVideo().currentTime &&
                    time.actionType !== ActionType.Poi
                ) {
                    startingSegmentTime = time.segment[0];
                    found = true;
                    break;
                }
            }
        }

        updatePoiSkipButtonForCurrentTime();

        const fullVideoSegment = contentState.sponsorTimes.filter((time) => time.actionType === ActionType.Full)[0];
        if (fullVideoSegment) {
            logUiLifecycle("categoryPill", "state", {
                action: "fullVideoSegmentDetected",
                UUID: fullVideoSegment.UUID,
                category: fullVideoSegment.category,
                categoryPillPresent: Boolean(getCategoryPill()),
                videoID: getVideoID(),
            });
            waitFor(() => getCategoryPill()).then(() => {
                logUiLifecycle("categoryPill", "state", {
                    action: "fullVideoSegmentApply",
                    UUID: fullVideoSegment.UUID,
                    category: fullVideoSegment.category,
                    videoID: getVideoID(),
                });
                getCategoryPill()?.setSegment(fullVideoSegment);
            }).catch(() => {
                logUiLifecycle("categoryPill", "error", {
                    action: "fullVideoSegmentApplyTimeout",
                    UUID: fullVideoSegment.UUID,
                    category: fullVideoSegment.category,
                    categoryPillPresent: Boolean(getCategoryPill()),
                    videoID: getVideoID(),
                });
            });
        }

        if (startingSegmentTime !== -1) {
            startSponsorSchedule(undefined, startingSegmentTime);
        } else {
            startSponsorSchedule();
        }
    }
}

function updatePoiSkipButtonForCurrentTime(): void {
    const video = getVideo();
    if (!video || !contentState.sponsorTimes) {
        emitSkipButtonStateChanged(false, null, undefined, "skipScheduler.updatePoiButton.missingState");
        return;
    }

    const poiSegments = contentState.sponsorTimes
        .filter(
            (time) =>
                time.segment[1] > video.currentTime &&
                time.actionType === ActionType.Poi &&
                time.hidden === SponsorHideType.Visible
        )
        .sort((a, b) => b.segment[0] - a.segment[0]);
    let manualPoiEnabled = false;
    logUiLifecycle("skipButton", "state", {
        action: "poiCandidates",
        videoID: getVideoID(),
        currentTime: video.currentTime,
        segmentCount: contentState.sponsorTimes.length,
        futurePoiCount: poiSegments.length,
        switchingVideos: contentState.switchingVideos,
    });

    for (const time of poiSegments) {
        const skipOption = utils.getCategorySelection(time.category)?.option;
        if (skipOption !== CategorySkipOption.ShowOverlay) {
            skipToTime({
                v: video,
                skipTime: time.segment,
                skippingSegments: [time],
                openNotice: true,
                unskipTime: video.currentTime,
            });
            manualPoiEnabled = skipOption !== CategorySkipOption.AutoSkip;
            if (skipOption === CategorySkipOption.AutoSkip) break;
        }
    }

    if (!manualPoiEnabled) {
        emitSkipButtonStateChanged(false, null, undefined, "skipScheduler.updatePoiButton.noFuturePoi");
    }
    logUiLifecycle("skipButton", "state", {
        action: "poiResult",
        videoID: getVideoID(),
        currentTime: video.currentTime,
        manualPoiEnabled,
    });
}

export function shouldAutoSkip(segment: SponsorTime): boolean {
    if (segment.source === SponsorSourceType.Danmaku) {
        return Config.config.enableAutoSkipDanmakuSkip;
    }
    if (
        Config.config.manualSkipOnFullVideo &&
        contentState.sponsorTimes?.some((s) => s.category === segment.category && s.actionType === ActionType.Full)
    ) {
        return false;
    }

    const categoryOption = utils.getCategorySelection(segment.category)?.option;

    if (categoryOption === CategorySkipOption.AutoSkip) {
        return true;
    } else if (
        Config.config.autoSkipOnMusicVideos &&
        contentState.sponsorTimes?.some((s) => s.category === "music_offtopic") &&
        segment.actionType === ActionType.Skip
    ) {
        return true;
    } else if (contentState.sponsorTimesSubmitting.some((s) => s.segment === segment.segment)) {
        return true;
    }

    return false;
}

export function shouldSkip(segment: SponsorTime): boolean {
    return (
        (segment.actionType !== ActionType.Full &&
            segment.source !== SponsorSourceType.YouTube &&
            utils.getCategorySelection(segment.category)?.option !== CategorySkipOption.ShowOverlay) ||
        (Config.config.autoSkipOnMusicVideos &&
            contentState.sponsorTimes?.some((s) => s.category === "music_offtopic") &&
            segment.actionType === ActionType.Skip)
    );
}

export function skipToTime({ v, skipTime, skippingSegments, openNotice, forceAutoSkip, unskipTime }: SkipToTimeParams): void {
    if (Config.config.disableSkipping) return;

    let autoSkip: boolean;
    if (sessionStorage.getItem("SKIPPING") === "false") {
        sessionStorage.setItem("SKIPPING", "null");
        autoSkip = false;
    } else {
        autoSkip = forceAutoSkip || shouldAutoSkip(skippingSegments[0]);
    }

    const isSubmittingSegment = contentState.sponsorTimesSubmitting.some((time) => time.segment === skippingSegments[0].segment);

    // SpeedUp handling: delegate to speedUpManager and reuse existing manual skip notice path
    let speedUpDelegated = false;
    let originalAutoSkipForExecuted = autoSkip;
    if (autoSkip && !isSubmittingSegment && skippingSegments[0].actionType === ActionType.Skip && shouldUseSpeedUp(skippingSegments[0])) {
        logDebug(`[SB] skipToTime delegating to SpeedUp ${skipTime[0]} -> ${skipTime[1]}`);
        let capturedOriginalRate: number | undefined;
        try {
            capturedOriginalRate = v?.playbackRate;
        } catch {
            capturedOriginalRate = undefined;
        }
        try {
            const rawRate = Config.config.speedUpPlaybackRate as unknown as number | string;
            const parsedRate = typeof rawRate === "string" ? parseFloat(rawRate) : rawRate;
            if (parsedRate > 1 && parsedRate <= 16 && v && v.playbackRate !== parsedRate) {
                v.playbackRate = parsedRate;
            }
        } catch {
            // ignore
        }
        void startSpeedUp(skippingSegments, skipTime as [number, number], capturedOriginalRate);
        // 复用下方已有的手动跳过 notice 逻辑（autoSkip=false 时的 createSkipNotice 去重路径），避免在此手动 emit 造成重复创建
        speedUpDelegated = true;
        originalAutoSkipForExecuted = true;
        autoSkip = false;
    }

    if ((autoSkip || isSubmittingSegment) && v.currentTime !== skipTime[1]) {
        switch (skippingSegments[0].actionType) {
            case ActionType.Poi:
            case ActionType.Skip: {
                if (v.loop && v.duration > 1 && skipTime[1] >= v.duration - 1) {
                    v.currentTime = 0;
                } else if (
                    v.duration > 1 &&
                    skipTime[1] >= v.duration &&
                    (navigator.vendor === "Apple Computer, Inc." || isPlayingPlaylist())
                ) {
                    v.currentTime = v.duration - 0.001;
                } else if (
                    v.duration > 1 &&
                    Math.abs(skipTime[1] - v.duration) < endTimeSkipBuffer &&
                    isFirefoxOrSafari() &&
                    !isSafari()
                ) {
                    v.currentTime = v.duration;
                } else {
                    if (inMuteSegment(skipTime[1], true)) {
                        v.muted = true;
                        videoMuted = true;
                    }

                    v.currentTime = skipTime[1];
                }

                break;
            }
            case ActionType.Mute: {
                if (!v.muted) {
                    v.muted = true;
                    videoMuted = true;
                }
                break;
            }
        }
    }

    if ((autoSkip || speedUpDelegated) && Config.config.audioNotificationOnSkip && !isSubmittingSegment && !getVideo()?.muted) {
        const beep = new Audio(chrome.runtime.getURL("icons/beep.ogg"));
        beep.volume = getVideo().volume * 0.1;
        const oldMetadata = navigator.mediaSession.metadata;
        beep.play();
        beep.addEventListener("ended", () => {
            navigator.mediaSession.metadata = null;
            setTimeout(() => {
                navigator.mediaSession.metadata = oldMetadata;
                beep.remove();
            });
        });
    }

    if (!autoSkip && skippingSegments.length === 1 && skippingSegments[0].actionType === ActionType.Poi) {
        emitSkipButtonStateChanged(true, skippingSegments[0], undefined, "skipScheduler.skipToTime.poi");
    } else {
        if (openNotice) {
            if (!Config.config.dontShowNotice || !autoSkip) {
                emitSkipNoticeRequested(
                    "skip",
                    skippingSegments,
                    autoSkip,
                    unskipTime,
                    false,
                    "skipScheduler.skipToTime.notice"
                );
            } else if (autoSkip) {
                contentState.activeSkipKeybindElement?.setShowKeybindHint(false);
                contentState.activeSkipKeybindElement = {
                    setShowKeybindHint: () => { },
                    toggleSkip: () => {
                        emitSkipNoticeRequested(
                            "skip",
                            skippingSegments,
                            autoSkip,
                            unskipTime,
                            true,
                            "skipScheduler.skipToTime.noticeToggle"
                        );

                        unskipSponsorTime(skippingSegments[0], unskipTime);
                    },
                };
            }
        }
    }

    emitSkipExecuted(skipTime as [number, number], skippingSegments, speedUpDelegated ? true : autoSkip, openNotice, unskipTime, "skipScheduler.skipToTime");

    if ((autoSkip && !speedUpDelegated) || isSubmittingSegment) sendTelemetryAndCount(skippingSegments, skipTime[1] - skipTime[0], true);
}

export function unskipSponsorTime(segment: SponsorTime, unskipTime: number = null, forceSeek = false): void {
    // If currently speeding up this segment, cancel speedUp as manual interaction
    if (isSpeedUpActive()) {
        void cancelSpeedUp(true, true);
    }

    if (segment.actionType === ActionType.Mute) {
        getVideo().muted = false;
        videoMuted = false;
    }

    if (forceSeek || segment.actionType === ActionType.Skip) {
        getVideo().currentTime = unskipTime ?? segment.segment[0] + 0.001;
    }
}

export function reskipSponsorTime(segment: SponsorTime, forceSeek = false): void {
    // If speeding, cancel first (reskip means instant skip, not speedUp)
    if (isSpeedUpActive()) {
        void cancelSpeedUp(true, false);
    }

    if (segment.actionType === ActionType.Mute && !forceSeek) {
        getVideo().muted = true;
        videoMuted = true;
    } else {
        const skippedTime = Math.max(segment.segment[1] - getVideo().currentTime, 0);
        const segmentDuration = segment.segment[1] - segment.segment[0];
        const fullSkip = skippedTime / segmentDuration > manualSkipPercentCount;

        getVideo().currentTime = segment.segment[1];
        sendTelemetryAndCount([segment], skippedTime, fullSkip);
        startSponsorSchedule(true, segment.segment[1], false);
    }
}
