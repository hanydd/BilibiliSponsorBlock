import SkipNoticeComponent from "./components/SkipNoticeComponent";
import Config from "./config";
import { keybindToString } from "./config/config";
import { ContentContainer } from "./ContentContainerTypes";
import { SkipButtonControlBar } from "./js-components/skipButtonControlBar";
import {
    contentState,
    getPageLoaded,
    setupPageLoadingListener,
} from "./content/state";
import { danmakuForSkip, initDanmakuSkip } from "./content/danmakuSkip";
import {
    checkPreviewbarState,
    createPreviewBar,
    initPreviewBarManager,
    removeDurationAfterSkip,
    selectSegment,
    updateActiveSegment,
    updatePreviewBar,
} from "./content/previewBarManager";
import {
    cancelSponsorSchedule,
    clearWaitingTime,
    getVirtualTime,
    initSkipScheduler,
    isSegmentMarkedNearCurrentTime,
    previewTime,
    reskipSponsorTime,
    skipToTime,
    startSkipScheduleCheckingForStartSponsors,
    startSponsorSchedule,
    unskipSponsorTime,
    updateVirtualTime,
    updateWaitingTime,
} from "./content/skipScheduler";
import { initMessageHandler, setupMessageListener } from "./content/messageHandler";
import { addHotkeyListener, initHotkeyHandler, seekFrameByKeyPressListener } from "./content/hotkeyHandler";
import { VoteResponse } from "./messageTypes";
import { CategoryPill } from "./render/CategoryPill";
import { DescriptionPortPill } from "./render/DescriptionPortPill";
import { CommentListener, DynamicListener } from "./render/DynamicAndCommentSponsorBlock";
import { setMessageNotice, showMessage } from "./render/MessageNotice";
import { PlayerButton } from "./render/PlayerButton";
import SubmissionNotice from "./render/SubmissionNotice";
import { getPortVideoByHash, postPortVideo, postPortVideoVote, updatePortedSegments } from "./requests/portVideo";
import { asyncRequestToServer } from "./requests/requests";
import { getSegmentsByVideoID } from "./requests/segments";
import { FetchResponse } from "./requests/type/requestType";
import { getVideoLabel } from "./requests/videoLabels";
import { checkPageForNewThumbnails, setupThumbnailListener } from "./thumbnail-utils/thumbnailManagement";
import {
    ActionType,
    BVID,
    Category,
    ChannelIDInfo,
    ChannelIDStatus,
    NewVideoID,
    PageType,
    PortVideo,
    SegmentUUID,
    SponsorHideType,
    SponsorSourceType,
    SponsorTime,
    YTID,
} from "./types";
import Utils from "./utils";
import { waitFor } from "./utils/";
import { AnimationUtils } from "./utils/animationUtils";
import { addCleanupListener, cleanPage } from "./utils/cleanup";
import { defaultPreviewTime } from "./utils/constants";
import { durationEquals } from "./utils/duraionUtils";
import { getErrorMessage, getFormattedTime } from "./utils/formating";
import { GenericUtils } from "./utils/genericUtils";
import { getHash, getVideoIDHash, HashedValue } from "./utils/hash";
import { getCidMapFromWindow } from "./utils/injectedScriptMessageUtils";
import { logDebug } from "./utils/logger";
import { getControls, getHashParams, getProgressBar } from "./utils/pageUtils";
import { generateUserID } from "./utils/setup";
import {
    detectPageType,
    getBvID,
    getChannelIDInfo,
    getCid,
    getPageType,
    getVideo,
    getVideoID,
    setupVideoModule,
    waitForVideo,
} from "./utils/video";
import { parseBvidAndCidFromVideoId } from "./utils/videoIdUtils";
import { openWarningDialog } from "./utils/warnings";

cleanPage();

detectPageType();

if (getPageType() === PageType.Live) {
    throw new Error("BSB is disabled on live pages.");
}

const utils = new Utils();

waitFor(() => Config.isReady(), 5000, 10).then(() => {
    setCategoryColorCSSVariables();

    if ([PageType.Dynamic, PageType.Channel].includes(detectPageType()) &&
        (Config.config.dynamicAndCommentSponsorBlocker && Config.config.dynamicSponsorBlock)
    ) DynamicListener();

    if ([PageType.Video, PageType.List, PageType.Dynamic, PageType.Channel, PageType.Opus, PageType.Festival].includes(getPageType()) &&
        (Config.config.dynamicAndCommentSponsorBlocker && Config.config.commentSponsorBlock)
    ) CommentListener();
});

if ((document.hidden && getPageType() == PageType.Video) || ([PageType.Video, PageType.Festival].includes(getPageType()))) {
    document.addEventListener("visibilitychange", () => videoElementChange(true, getVideo()), { once: true });
    window.addEventListener("mouseover", () => videoElementChange(true, getVideo()), { once: true });
}

setupPageLoadingListener();

initDanmakuSkip({
    getVirtualTime,
    isSegmentMarkedNearCurrentTime,
    skipToTime,
    openSubmissionMenu,
});

initHotkeyHandler({ startOrEndTimingNewSegment, submitSegments, openSubmissionMenu, previewRecentSegment });

initPreviewBarManager({ voteAsync, updateVisibilityOfPlayerControlsButton });

setupVideoModule({ videoIDChange, channelIDChange, resetValues, videoElementChange });

// wait for hydration to complete
waitFor(() => getPageLoaded(), 10000, 100).then(setupThumbnailListener);

setMessageNotice(false, getPageLoaded);

const playerButton = new PlayerButton(
    startOrEndTimingNewSegment,
    cancelCreatingSegment,
    clearSponsorTimes,
    openSubmissionMenu,
    openInfoMenu
);

export { getPageLoaded } from "./content/state";


addHotkeyListener();


// Contains all of the functions and variables needed by the skip notice
const skipNoticeContentContainer: ContentContainer = () => ({
    vote,
    dontShowNoticeAgain,
    unskipSponsorTime,
    sponsorTimes: contentState.sponsorTimes,
    sponsorTimesSubmitting: contentState.sponsorTimesSubmitting,
    skipNotices: contentState.skipNotices,
    advanceSkipNotices: contentState.advanceSkipNotices,
    sponsorVideoID: getVideoID(),
    reskipSponsorTime,
    updatePreviewBar,
    sponsorSubmissionNotice: contentState.submissionNotice,
    resetSponsorSubmissionNotice,
    updateEditButtonsOnPlayer: updateSegmentSubmitting,
    previewTime,
    videoInfo: contentState.videoInfo,
    getRealCurrentTime: getRealCurrentTime,
    lockedCategories: contentState.lockedCategories,
    channelIDInfo: getChannelIDInfo(),
});

initSkipScheduler({
    skipNoticeContentContainer,
    updateActiveSegment,
});

initMessageHandler({
    startOrEndTimingNewSegment,
    isSegmentCreationInProgress,
    closeInfoMenu,
    openSubmissionMenu,
    videoIDChange,
    selectSegment,
    vote,
    updatePreviewBar,
    updateSegmentSubmitting,
    updateSponsorTimesSubmitting,
    unskipSponsorTime,
    reskipSponsorTime,
    sponsorsLookup,
    submitPortVideo,
    portVideoVote,
    updateSegments,
    updateVisibilityOfPlayerControlsButton,
    setCategoryColorCSSVariables,
    utils,
});
setupMessageListener();

function resetValues() {
    contentState.lastCheckTime = 0;
    contentState.lastCheckVideoTime = -1;
    contentState.previewedSegment = false;

    contentState.sponsorTimes = [];
    contentState.sponsorSkipped = [];
    contentState.lastResponseStatus = 0;
    contentState.shownSegmentFailedToFetchWarning = false;

    contentState.videoInfo = null;
    contentState.channelWhitelisted = false;
    contentState.lockedCategories = [];

    //empty the preview bar
    if (contentState.previewBar !== null) {
        contentState.previewBar.clear();
    }

    // resetDurationAfterSkip
    removeDurationAfterSkip();

    //reset sponsor data found check
    contentState.sponsorDataFound = false;

    if (contentState.switchingVideos === null) {
        // When first loading a video, it is not switching videos
        contentState.switchingVideos = false;
    } else {
        contentState.switchingVideos = true;
        logDebug("Setting switching videos to true (reset data)");
    }

    contentState.skipButtonControlBar?.disable();
    contentState.categoryPill?.resetSegment();

    for (let i = 0; i < contentState.skipNotices.length; i++) {
        contentState.skipNotices.pop()?.close();
    }

    if (contentState.advanceSkipNotices) {
        contentState.advanceSkipNotices.close();
        contentState.advanceSkipNotices = null;
    }
}

async function videoIDChange(): Promise<void> {
    //setup the preview bar
    if (contentState.previewBar === null) {
        waitFor(getControls).then(createPreviewBar);
    }

    // Notify the popup about the video change
    chrome.runtime.sendMessage({
        message: "videoChanged",
        videoID: getVideoID(),
        whitelisted: contentState.channelWhitelisted,
    });

    sponsorsLookup();
    checkPageForNewThumbnails();

    // Clear unsubmitted segments from the previous video
    contentState.sponsorTimesSubmitting = [];
    updateSponsorTimesSubmitting();

    // TODO use mutation observer to get the reloading of the video element
    // wait for the video player to load and ready
    await waitFor(() => document.querySelector(".bpx-player-loading-panel.bpx-state-loading"), 5000, 5);
    await waitFor(getProgressBar, 24 * 60 * 60, 500);

    // Make sure all player buttons are properly added
    updateVisibilityOfPlayerControlsButton();
    checkPreviewbarState();
    setupDescriptionPill();

    if ([PageType.Video, PageType.List, PageType.Dynamic, PageType.Channel, PageType.Opus, PageType.Festival].includes(getPageType()) &&
        (Config.config.dynamicAndCommentSponsorBlocker && Config.config.commentSponsorBlock)
    ) CommentListener();
}

/**
 * Triggered every time the video duration changes.
 * This happens when the resolution changes or at random time to clear memory.
 */
function durationChangeListener(): void {
    updatePreviewBar();
}

/**
 * Triggered once the video is ready.
 * This is mainly to attach to embedded players who don't have a video element visible.
 */
function videoOnReadyListener(): void {
    createPreviewBar();
    updatePreviewBar();
    updateVisibilityOfPlayerControlsButton();
}


let playbackRateCheckInterval: NodeJS.Timeout | null = null;
let lastPlaybackSpeed = 1;
let setupVideoListenersFirstTime = true;
function setupVideoListeners(video: HTMLVideoElement) {
    if (!video) return; // Maybe video became invisible

    //wait until it is loaded
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
        // Used by videospeed extension (https://github.com/igrigorik/videospeed/pull/740)
        video.addEventListener("videoSpeed_ratechange", rateChangeListener);

        const playListener = () => {
            // If it is not the first event, then the only way to get to 0 is if there is a seek event
            // This check makes sure that changing the video resolution doesn't cause the extension to think it
            // gone back to the begining
            if (video.readyState <= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime === 0) return;

            updateVirtualTime();

            if (contentState.switchingVideos || lastPausedAtZero) {
                contentState.switchingVideos = false;
                logDebug("Setting switching videos to false");

                // If already segments loaded before video, retry to skip starting segments
                if (contentState.sponsorTimes) startSkipScheduleCheckingForStartSponsors();
            }

            lastPausedAtZero = false;

            // Make sure it doesn't get double called with the playing event
            if (
                Math.abs(contentState.lastCheckVideoTime - video.currentTime) > 0.3 ||
                (contentState.lastCheckVideoTime !== video.currentTime && Date.now() - contentState.lastCheckTime > 2000)
            ) {
                contentState.lastCheckTime = Date.now();
                contentState.lastCheckVideoTime = video.currentTime;

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
                    `[SB] Playing event after buffering: ${Math.abs(contentState.lastCheckVideoTime - video.currentTime) > 0.3 ||
                    (contentState.lastCheckVideoTime !== video.currentTime && Date.now() - contentState.lastCheckTime > 2000)
                    }`
                );
            }

            if (contentState.switchingVideos) {
                contentState.switchingVideos = false;
                logDebug("Setting switching videos to false");

                // If already segments loaded before video, retry to skip starting segments
                if (contentState.sponsorTimes) startSkipScheduleCheckingForStartSponsors();
            }

            // Make sure it doesn't get double called with the play event
            if (
                Math.abs(contentState.lastCheckVideoTime - video.currentTime) > 0.3 ||
                (contentState.lastCheckVideoTime !== video.currentTime && Date.now() - contentState.lastCheckTime > 2000)
            ) {
                contentState.lastCheckTime = Date.now();
                contentState.lastCheckVideoTime = video.currentTime;

                startSponsorSchedule();
            }

            if (playbackRateCheckInterval) clearInterval(playbackRateCheckInterval);
            lastPlaybackSpeed = video.playbackRate;

            // Video speed controller compatibility
            // That extension makes rate change events not propagate
            if (document.body.classList.contains("vsc-initialized")) {
                playbackRateCheckInterval = setInterval(() => {
                    if ((!getVideoID() || video.paused) && playbackRateCheckInterval) {
                        // Video is gone, stop checking
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
            contentState.lastKnownVideoTime.fromPause = false;

            if (!video.paused) {
                // Reset lastCheckVideoTime
                contentState.lastCheckTime = Date.now();
                contentState.lastCheckVideoTime = video.currentTime;

                updateVirtualTime();
                clearWaitingTime();

                // Sometimes looped videos loop back to almost zero, but not quite
                if (video.loop && video.currentTime < 0.2) {
                    startSponsorSchedule(false, 0);
                } else {
                    // Include intersecting segments so that seeking into the middle of a segment still triggers a skip
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
            // Reset lastCheckVideoTime
            contentState.lastCheckVideoTime = -1;
            contentState.lastCheckTime = 0;

            if (playbackRateCheckInterval) clearInterval(playbackRateCheckInterval);

            contentState.lastKnownVideoTime.videoTime = null;
            contentState.lastKnownVideoTime.preciseTime = null;
            updateWaitingTime();

            cancelSponsorSchedule();
        };
        const pauseListener = () => {
            contentState.lastKnownVideoTime.fromPause = true;

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


function setupSkipButtonControlBar() {
    if (!contentState.skipButtonControlBar) {
        contentState.skipButtonControlBar = new SkipButtonControlBar({
            skip: (segment) =>
                skipToTime({
                    v: getVideo(),
                    skipTime: segment.segment,
                    skippingSegments: [segment],
                    openNotice: true,
                    forceAutoSkip: true,
                }),
            selectSegment,
        });
    }

    contentState.skipButtonControlBar.attachToPage();
}

function setupCategoryPill() {
    if (!contentState.categoryPill) {
        contentState.categoryPill = new CategoryPill();
    }

    contentState.categoryPill.attachToPage(voteAsync);
}

function setupDescriptionPill() {
    if (!contentState.descriptionPill) {
        contentState.descriptionPill = new DescriptionPortPill(
            getPortVideo,
            submitPortVideo,
            portVideoVote,
            updateSegments,
            sponsorsLookup
        );
    }
    contentState.descriptionPill.setupDescription(getVideoID());
}

async function updatePortVideoElements(newPortVideo: PortVideo) {
    contentState.portVideo = newPortVideo;
    // notify description pill
    waitFor(() => contentState.descriptionPill).then(() => contentState.descriptionPill.setPortVideoData(newPortVideo));

    // notify popup of port video changes
    chrome.runtime.sendMessage({
        message: "infoUpdated",
        found: contentState.sponsorDataFound,
        status: contentState.lastResponseStatus,
        sponsorTimes: contentState.sponsorTimes,
        portVideo: newPortVideo,
        time: getVideo()?.currentTime ?? 0,
    });
}

async function getPortVideo(videoId: NewVideoID, bypassCache = false) {
    const newPortVideo = await getPortVideoByHash(videoId, { bypassCache });
    if (newPortVideo?.UUID === contentState.portVideo?.UUID) return;
    contentState.portVideo = newPortVideo;

    updatePortVideoElements(contentState.portVideo);
}

async function submitPortVideo(ytbID: YTID): Promise<PortVideo> {
    const newPortVideo = await postPortVideo(getVideoID(), ytbID, getVideo()?.duration);
    contentState.portVideo = newPortVideo;
    updatePortVideoElements(contentState.portVideo);
    sponsorsLookup(true, true, true);
    return newPortVideo;
}

async function portVideoVote(UUID: string, voteType: number) {
    await postPortVideoVote(UUID, getVideoID(), voteType);
    await getPortVideo(getVideoID(), true);
}

async function updateSegments(UUID: string): Promise<FetchResponse> {
    const response = await updatePortedSegments(getVideoID(), UUID);
    if (response.ok) {
        sponsorsLookup(true, true, true);
    }
    return response;
}

async function sponsorsLookup(keepOldSubmissions = true, ignoreServerCache = false, forceUpdatePreviewBar = false) {
    const videoID = getVideoID();
    const { bvId, cid } = parseBvidAndCidFromVideoId(videoID);
    if (!videoID) {
        console.error("[SponsorBlock] Attempted to fetch segments with a null/undefined videoID.");
        return;
    }
    if (contentState.lookupWaiting) return;

    if (!getVideo()) {
        //there is still no video here
        await waitForVideo();

        contentState.lookupWaiting = true;
        setTimeout(() => {
            contentState.lookupWaiting = false;
            sponsorsLookup(keepOldSubmissions, ignoreServerCache, forceUpdatePreviewBar);
        }, 100);
        return;
    }

    const extraRequestData: Record<string, unknown> = {};
    const hashParams = getHashParams();
    if (hashParams.requiredSegment) extraRequestData.requiredSegment = hashParams.requiredSegment;

    const hashPrefix = (await getVideoIDHash(videoID)).slice(0, 4) as BVID & HashedValue;
    const segmentResponse = await getSegmentsByVideoID(videoID, extraRequestData, ignoreServerCache);

    // Make sure an old pending request doesn't get used.
    if (videoID !== getVideoID()) return;

    // store last response status
    contentState.lastResponseStatus = segmentResponse?.status;

    if (segmentResponse.status === 200) {
        // filter and refresh cid
        let receivedSegments: SponsorTime[] = segmentResponse.segments?.filter(segment => segment.cid === cid);

        const uniqueCids = new Set(segmentResponse?.segments?.filter((segment) => durationEquals(segment.videoDuration, getVideo()?.duration, 5)).map(s => s.cid));
        console.log("unique cids from segments", uniqueCids)
        if (uniqueCids.size > 1) {
            const cidMap = await getCidMapFromWindow(bvId);
            console.log("[BSB] Multiple CIDs found, using the one from the window object", cidMap);
            if (cidMap.size == 1) {
                receivedSegments = segmentResponse.segments?.filter(segment => uniqueCids.has(segment.cid));
                // TOOO: inform server about cid change
            }
        }

        if (receivedSegments && receivedSegments.length) {
            contentState.sponsorDataFound = true;

            // Check if any old submissions should be kept
            if (contentState.sponsorTimes !== null && keepOldSubmissions) {
                for (let i = 0; i < contentState.sponsorTimes.length; i++) {
                    if (contentState.sponsorTimes[i].source === SponsorSourceType.Local) {
                        // This is a user submission, keep it
                        receivedSegments.push(contentState.sponsorTimes[i]);
                    }
                }
            }

            const oldSegments = contentState.sponsorTimes || [];
            contentState.sponsorTimes = receivedSegments;

            // Hide all submissions smaller than the minimum duration
            if (Config.config.minDuration !== 0) {
                for (const segment of contentState.sponsorTimes) {
                    const duration = segment.segment[1] - segment.segment[0];
                    if (duration > 0 && duration < Config.config.minDuration) {
                        segment.hidden = SponsorHideType.MinimumDuration;
                    }
                }
            }

            if (keepOldSubmissions) {
                for (const segment of oldSegments) {
                    const otherSegment = contentState.sponsorTimes.find((other) => segment.UUID === other.UUID);
                    if (otherSegment) {
                        // If they downvoted it, or changed the category, keep it
                        otherSegment.hidden = segment.hidden;
                        otherSegment.category = segment.category;
                    }
                }
            }

            // See if some segments should be hidden
            const downvotedData = Config.local.downvotedSegments[hashPrefix];
            if (downvotedData) {
                for (const segment of contentState.sponsorTimes) {
                    const hashedUUID = await getHash(segment.UUID, 1);
                    const segmentDownvoteData = downvotedData.segments.find((downvote) => downvote.uuid === hashedUUID);
                    if (segmentDownvoteData) {
                        segment.hidden = segmentDownvoteData.hidden;
                    }
                }
            }

            startSkipScheduleCheckingForStartSponsors();

            //update the preview bar
            //leave the type blank for now until categories are added
            if (
                forceUpdatePreviewBar ||
                contentState.lastPreviewBarUpdate == getVideoID() ||
                (contentState.lastPreviewBarUpdate == null && !isNaN(getVideo().duration))
            ) {
                //set it now
                //otherwise the listener can handle it
                updatePreviewBar();
            }
        }
    }

    // notify popup of segment changes
    chrome.runtime.sendMessage({
        message: "infoUpdated",
        found: contentState.sponsorDataFound,
        status: contentState.lastResponseStatus,
        sponsorTimes: contentState.sponsorTimes,
        portVideo: contentState.portVideo,
        time: getVideo()?.currentTime ?? 0,
    });

    if (Config.config.isVip) {
        lockedCategoriesLookup();
    }
}

async function lockedCategoriesLookup(): Promise<void> {
    const hashPrefix = (await getHash(getVideoID(), 1)).slice(0, 4);
    const response = await asyncRequestToServer("GET", "/api/lockCategories/" + hashPrefix);

    if (response.ok) {
        try {
            const categoriesResponse = JSON.parse(response.responseText).filter(
                (lockInfo) => lockInfo.videoID === getVideoID()
            )[0]?.categories;
            if (Array.isArray(categoriesResponse)) {
                contentState.lockedCategories = categoriesResponse;
            }
        } catch (e) { } //eslint-disable-line no-empty
    }
}


//checks if this channel is whitelisted, should be done only after the channelID has been loaded
async function channelIDChange(channelIDInfo: ChannelIDInfo) {
    const whitelistedChannels = Config.config.whitelistedChannels;

    //see if this is a whitelisted channel
    if (
        whitelistedChannels != undefined &&
        channelIDInfo.status === ChannelIDStatus.Found &&
        whitelistedChannels.some(ch => ch.id === channelIDInfo.id)
    ) {
        contentState.channelWhitelisted = true;
    }

    // check if the start of segments were missed
    if (Config.config.forceChannelCheck && contentState.sponsorTimes?.length > 0) startSkipScheduleCheckingForStartSponsors();
}

function videoElementChange(newVideo: boolean, video: HTMLVideoElement): void {
    waitFor(() => Config.isReady() && !document.hidden, 24 * 60 * 60, 500).then(() => {
        if (newVideo) {
            setupVideoListeners(video);
            setupSkipButtonControlBar();
            setupCategoryPill();
            setupDescriptionPill();
        }

        updatePreviewBar();
        checkPreviewbarState();

        // Incase the page is still transitioning, check again in a few seconds
        setTimeout(checkPreviewbarState, 100);
        setTimeout(checkPreviewbarState, 1000);
        setTimeout(checkPreviewbarState, 5000);
    });
}


/** Creates any missing buttons on the player and updates their visiblity. */
async function updateVisibilityOfPlayerControlsButton(): Promise<void> {
    // Not on a proper video yet
    if (!getVideoID()) return;

    contentState.playerButtons = await playerButton.createButtons();

    updateSegmentSubmitting();
}

/** Updates the visibility of buttons on the player related to creating segments. */
function updateSegmentSubmitting(): void {
    // Don't try to update the buttons if we aren't on a Bilibili video page
    if (!getVideoID()) return;
    playerButton.updateSegmentSubmitting(contentState.sponsorTimesSubmitting);
}

/**
 * Used for submitting. This will use the HTML displayed number when required as the video's
 * current time is out of date while scrubbing or at the end of the getVideo(). This is not needed
 * for sponsor skipping as the video is not playing during these times.
 */
function getRealCurrentTime(): number {
    // Used to check if ending backdrop is selected
    const endingDataSelect = document.querySelector(".bpx-player-ending-wrap")?.getAttribute("data-select");

    if (endingDataSelect === "1") {
        // At the end of the video
        return getVideo()?.duration;
    } else {
        return getVideo().currentTime;
    }
}

function startOrEndTimingNewSegment() {
    const roundedTime = Math.round((getRealCurrentTime() + Number.EPSILON) * 1000) / 1000;
    if (!isSegmentCreationInProgress()) {
        contentState.sponsorTimesSubmitting.push({
            cid: getCid(),
            segment: [roundedTime],
            UUID: generateUserID() as SegmentUUID,
            category: Config.config.defaultCategory,
            actionType: ActionType.Skip,
            source: SponsorSourceType.Local,
        });
    } else {
        // Finish creating the new segment
        const existingSegment = getIncompleteSegment();
        const existingTime = existingSegment.segment[0];
        const currentTime = roundedTime;

        // Swap timestamps if the user put the segment end before the start
        existingSegment.segment = [Math.min(existingTime, currentTime), Math.max(existingTime, currentTime)];
    }

    // Save the newly created segment
    Config.local.unsubmittedSegments[getVideoID()] = contentState.sponsorTimesSubmitting;
    Config.forceLocalUpdate("unsubmittedSegments");

    // Make sure they know if someone has already submitted something it while they were watching
    sponsorsLookup(true, true);

    updateSegmentSubmitting();
    updateSponsorTimesSubmitting(false);

    if (
        contentState.lastResponseStatus !== 200 &&
        contentState.lastResponseStatus !== 404 &&
        !contentState.shownSegmentFailedToFetchWarning &&
        Config.config.showSegmentFailedToFetchWarning
    ) {
        showMessage(chrome.i18n.getMessage("segmentFetchFailureWarning"), "warning");

        contentState.shownSegmentFailedToFetchWarning = true;
    }
}

function getIncompleteSegment(): SponsorTime {
    return contentState.sponsorTimesSubmitting[contentState.sponsorTimesSubmitting.length - 1];
}

/** Is the latest submitting segment incomplete */
function isSegmentCreationInProgress(): boolean {
    const segment = getIncompleteSegment();
    return segment && segment?.segment?.length !== 2;
}

function cancelCreatingSegment() {
    if (isSegmentCreationInProgress()) {
        if (contentState.sponsorTimesSubmitting.length > 1) {
            // If there's more than one segment: remove last
            contentState.sponsorTimesSubmitting.pop();
            Config.local.unsubmittedSegments[getVideoID()] = contentState.sponsorTimesSubmitting;
        } else {
            // Otherwise delete the video entry & close submission menu
            resetSponsorSubmissionNotice();
            contentState.sponsorTimesSubmitting = [];
            delete Config.local.unsubmittedSegments[getVideoID()];
        }
        Config.forceLocalUpdate("unsubmittedSegments");
    }

    updateSegmentSubmitting();
    updateSponsorTimesSubmitting(false);
}

function updateSponsorTimesSubmitting(getFromConfig = true) {
    const segmentTimes = Config.local.unsubmittedSegments[getVideoID()];

    //see if this data should be saved in the sponsorTimesSubmitting variable
    if (getFromConfig && segmentTimes != undefined) {
        contentState.sponsorTimesSubmitting = [];

        for (const segmentTime of segmentTimes) {
            contentState.sponsorTimesSubmitting.push({
                cid: getCid(),
                segment: segmentTime.segment,
                UUID: segmentTime.UUID,
                category: segmentTime.category,
                actionType: segmentTime.actionType,
                source: segmentTime.source,
            });
        }

        if (contentState.sponsorTimesSubmitting.length > 0) {
            // Assume they already previewed a segment
            contentState.previewedSegment = true;
        }
    }

    updatePreviewBar();

    // Restart skipping schedule
    if (getVideo() !== null) startSponsorSchedule();

    if (contentState.submissionNotice !== null) {
        contentState.submissionNotice.update();
    }

    checkForPreloadedSegment();
}

function openInfoMenu() {
    if (document.getElementById("sponsorBlockPopupContainer") != null) {
        //it's already added
        return;
    }

    contentState.popupInitialised = false;

    const popup = document.createElement("div");
    popup.id = "sponsorBlockPopupContainer";

    const frame = document.createElement("iframe");
    frame.width = "374";
    frame.height = "500";
    frame.style.borderRadius = "6px";
    frame.style.margin = "0px auto 20px";
    frame.addEventListener("load", async () => {
        frame.contentWindow.postMessage("", "*");

        // To support userstyles applying to the popup
        const stylusStyle = document.querySelector(".stylus");
        if (stylusStyle) {
            frame.contentWindow.postMessage(
                {
                    type: "style",
                    css: stylusStyle.textContent,
                },
                "*"
            );
        }
    });
    frame.src = chrome.runtime.getURL("popup.html");
    popup.appendChild(frame);

    // insert into the avatar container to prevent the popup from being cut off
    const container = document.querySelector("#danmukuBox") as HTMLElement;
    container.prepend(popup);
}

function closeInfoMenu() {
    const popup = document.getElementById("sponsorBlockPopupContainer");
    if (popup === null) return;

    popup.remove();

    // show info button again
    window.dispatchEvent(new Event("closePopupMenu"));
}

function clearSponsorTimes() {
    const currentVideoID = getVideoID();

    const sponsorTimes = Config.local.unsubmittedSegments[currentVideoID];

    if (sponsorTimes != undefined && sponsorTimes.length > 0) {
        resetSponsorSubmissionNotice();

        //clear the sponsor times
        delete Config.local.unsubmittedSegments[currentVideoID];
        Config.forceLocalUpdate("unsubmittedSegments");

        //clear sponsor times submitting
        contentState.sponsorTimesSubmitting = [];

        updatePreviewBar();
        updateSegmentSubmitting();
    }
}

//if skipNotice is null, it will not affect the UI
async function vote(
    type: number,
    UUID: SegmentUUID,
    category?: Category,
    skipNotice?: SkipNoticeComponent
): Promise<VoteResponse> {
    if (skipNotice !== null && skipNotice !== undefined) {
        //add loading info
        skipNotice.addVoteButtonInfo.bind(skipNotice)(chrome.i18n.getMessage("Loading"));
        skipNotice.setNoticeInfoMessage.bind(skipNotice)();
    }

    const response = await voteAsync(type, UUID, category);
    if (response != undefined) {
        //see if it was a success or failure
        if (skipNotice != null) {
            if (response.successType == 1 || (response.successType == -1 && response.statusCode == 429)) {
                //success (treat rate limits as a success)
                skipNotice.afterVote.bind(skipNotice)(utils.getSponsorTimeFromUUID(contentState.sponsorTimes, UUID), type, category);
            } else if (response.successType == -1) {
                if (
                    response.statusCode === 403 &&
                    response.responseText.startsWith("Vote rejected due to a tip from a moderator.")
                ) {
                    openWarningDialog(skipNoticeContentContainer);
                } else {
                    skipNotice.setNoticeInfoMessage.bind(skipNotice)(
                        getErrorMessage(response.statusCode, response.responseText)
                    );
                }

                skipNotice.resetVoteButtonInfo.bind(skipNotice)();
            }
        }
    }

    return response;
}

async function voteAsync(type: number, UUID: SegmentUUID, category?: Category): Promise<VoteResponse | undefined> {
    const sponsorIndex = utils.getSponsorIndexFromUUID(contentState.sponsorTimes, UUID);

    // Don't vote for preview sponsors
    if (sponsorIndex == -1 || contentState.sponsorTimes[sponsorIndex].source !== SponsorSourceType.Server)
        return Promise.resolve(undefined);

    // See if the local time saved count and skip count should be saved
    if ((type === 0 && contentState.sponsorSkipped[sponsorIndex]) || (type === 1 && !contentState.sponsorSkipped[sponsorIndex])) {
        let factor = 1;
        if (type == 0) {
            factor = -1;

            contentState.sponsorSkipped[sponsorIndex] = false;
        }

        // Count this as a skip
        Config.config.minutesSaved =
            Config.config.minutesSaved +
            (factor * (contentState.sponsorTimes[sponsorIndex].segment[1] - contentState.sponsorTimes[sponsorIndex].segment[0])) / 60;

        Config.config.skipCount = Config.config.skipCount + factor;
    }

    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            {
                message: "submitVote",
                type: type,
                UUID: UUID,
                category: category,
            },
            (response) => {
                if (response.successType === 1) {
                    // Change the sponsor locally
                    const segment = utils.getSponsorTimeFromUUID(contentState.sponsorTimes, UUID);
                    if (segment) {
                        if (type === 0) {
                            segment.hidden = SponsorHideType.Downvoted;
                        } else if (category) {
                            segment.category = category;
                        } else if (type === 1) {
                            segment.hidden = SponsorHideType.Visible;
                        }

                        if (!category && !Config.config.isVip) {
                            utils.addHiddenSegment(getVideoID(), segment.UUID, segment.hidden);
                        }

                        updatePreviewBar();
                    }
                }

                resolve(response);
            }
        );
    });
}

//Closes all notices that tell the user that a sponsor was just skipped
function closeAllSkipNotices() {
    const notices = document.getElementsByClassName("sponsorSkipNotice");
    for (let i = 0; i < notices.length; i++) {
        notices[i].remove();
    }
}

function dontShowNoticeAgain() {
    Config.config.dontShowNotice = true;
    closeAllSkipNotices();
}

/**
 * Helper method for the submission notice to clear itself when it closes
 */
function resetSponsorSubmissionNotice(callRef = true) {
    contentState.submissionNotice?.close(callRef);
    contentState.submissionNotice = null;
}

function closeSubmissionMenu() {
    contentState.submissionNotice?.close();
    contentState.submissionNotice = null;
}

function openSubmissionMenu() {
    if (contentState.submissionNotice !== null) {
        closeSubmissionMenu();
        return;
    }

    if (contentState.sponsorTimesSubmitting !== undefined && contentState.sponsorTimesSubmitting.length > 0) {
        contentState.submissionNotice = new SubmissionNotice(skipNoticeContentContainer, sendSubmitMessage);
        // Add key bind for jumpping to next frame, for easier sponsor time editting
        document.addEventListener("keydown", seekFrameByKeyPressListener);
    }
}

function previewRecentSegment() {
    if (contentState.sponsorTimesSubmitting !== undefined && contentState.sponsorTimesSubmitting.length > 0) {
        previewTime(contentState.sponsorTimesSubmitting[contentState.sponsorTimesSubmitting.length - 1].segment[0] - defaultPreviewTime);

        if (contentState.submissionNotice) {
            contentState.submissionNotice.scrollToBottom();
        }
    }
}

function submitSegments() {
    if (contentState.sponsorTimesSubmitting !== undefined && contentState.sponsorTimesSubmitting.length > 0 && contentState.submissionNotice !== null) {
        contentState.submissionNotice.submit();
    }
}

//send the message to the background js
//called after all the checks have been made that it's okay to do so
async function sendSubmitMessage(): Promise<boolean> {
    // TODO: add checks for premiere videos

    if (
        !contentState.previewedSegment &&
        !contentState.sponsorTimesSubmitting.every(
            (segment) =>
                [ActionType.Full, ActionType.Poi].includes(segment.actionType) ||
                segment.segment[1] >= getVideo()?.duration ||
                segment.segment[0] === 0
        )
    ) {
        showMessage(
            `${chrome.i18n.getMessage("previewSegmentRequired")} ${keybindToString(Config.config.previewKeybind)}`,
            "warning"
        );
        return false;
    }

    // Add loading animation
    contentState.playerButtons.submit.image.src = chrome.runtime.getURL("icons/PlayerUploadIconSponsorBlocker.svg");
    const stopAnimation = AnimationUtils.applyLoadingAnimation(contentState.playerButtons.submit.button, 1, () =>
        updateSegmentSubmitting()
    );

    //check if a sponsor exceeds the duration of the video
    for (let i = 0; i < contentState.sponsorTimesSubmitting.length; i++) {
        if (contentState.sponsorTimesSubmitting[i].segment[1] > getVideo().duration) {
            contentState.sponsorTimesSubmitting[i].segment[1] = getVideo().duration;
        }
    }

    //update sponsorTimes
    Config.local.unsubmittedSegments[getVideoID()] = contentState.sponsorTimesSubmitting;
    Config.forceLocalUpdate("unsubmittedSegments");

    // Check to see if any of the submissions are below the minimum duration set
    if (Config.config.minDuration > 0) {
        for (let i = 0; i < contentState.sponsorTimesSubmitting.length; i++) {
            const duration = contentState.sponsorTimesSubmitting[i].segment[1] - contentState.sponsorTimesSubmitting[i].segment[0];
            if (duration > 0 && duration < Config.config.minDuration) {
                const confirmShort =
                    chrome.i18n.getMessage("shortCheck") + "\n\n" + getSegmentsMessage(contentState.sponsorTimesSubmitting);

                if (!confirm(confirmShort)) return false;
            }
        }
    }

    const response = await asyncRequestToServer("POST", "/api/skipSegments", {
        videoID: getBvID(),
        cid: getCid(),
        userID: Config.config.userID,
        segments: contentState.sponsorTimesSubmitting,
        videoDuration: getVideo()?.duration,
        userAgent: `${chrome.runtime.id}/v${chrome.runtime.getManifest().version}`,
    });

    if (response.status === 200) {
        stopAnimation();

        // Remove segments from storage since they've already been submitted
        delete Config.local.unsubmittedSegments[getVideoID()];
        Config.forceLocalUpdate("unsubmittedSegments");

        const newSegments = contentState.sponsorTimesSubmitting;
        try {
            const receivedNewSegments = JSON.parse(response.responseText);
            if (receivedNewSegments?.length === newSegments.length) {
                for (let i = 0; i < receivedNewSegments.length; i++) {
                    newSegments[i].UUID = receivedNewSegments[i].UUID;
                    newSegments[i].source = SponsorSourceType.Server;
                }
            }
        } catch (e) { } // eslint-disable-line no-empty

        // Add submissions to current sponsors list
        contentState.sponsorTimes = (contentState.sponsorTimes || []).concat(newSegments).sort((a, b) => a.segment[0] - b.segment[0]);

        // Increase contribution count
        Config.config.sponsorTimesContributed = Config.config.sponsorTimesContributed + contentState.sponsorTimesSubmitting.length;

        // New count just used to see if a warning "Read The Guidelines!!" message needs to be shown
        // One per time submitting
        Config.config.submissionCountSinceCategories = Config.config.submissionCountSinceCategories + 1;

        // Empty the submitting times
        contentState.sponsorTimesSubmitting = [];

        updatePreviewBar();

        const fullVideoSegment = contentState.sponsorTimes.filter((time) => time.actionType === ActionType.Full)[0];
        if (fullVideoSegment) {
            waitFor(() => contentState.categoryPill).then(() => {
                contentState.categoryPill?.setSegment(fullVideoSegment);
            });
            // refresh the video labels cache
            getVideoLabel(getVideoID(), true);
        }

        return true;
    } else {
        // Show that the upload failed
        contentState.playerButtons.submit.button.style.animation = "unset";
        contentState.playerButtons.submit.image.src = chrome.runtime.getURL("icons/PlayerUploadFailedIconSponsorBlocker.svg");

        if (
            response.status === 403 &&
            response.responseText.startsWith("Submission rejected due to a tip from a moderator.")
        ) {
            openWarningDialog(skipNoticeContentContainer);
        } else {
            showMessage(getErrorMessage(response.status, response.responseText), "warning");
        }
    }

    return false;
}

//get the message that visually displays the video times
function getSegmentsMessage(sponsorTimes: SponsorTime[]): string {
    let sponsorTimesMessage = "";

    for (let i = 0; i < sponsorTimes.length; i++) {
        for (let s = 0; s < sponsorTimes[i].segment.length; s++) {
            let timeMessage = getFormattedTime(sponsorTimes[i].segment[s]);
            //if this is an end time
            if (s == 1) {
                timeMessage = " " + chrome.i18n.getMessage("to") + " " + timeMessage;
            } else if (i > 0) {
                //add commas if necessary
                timeMessage = ", " + timeMessage;
            }

            sponsorTimesMessage += timeMessage;
        }
    }

    return sponsorTimesMessage;
}

export { seekFrameByKeyPressListener } from "./content/hotkeyHandler";

function checkForPreloadedSegment() {
    if (contentState.loadedPreloadedSegment) return;

    contentState.loadedPreloadedSegment = true;
    const hashParams = getHashParams();

    let pushed = false;
    const segments = hashParams.segments;
    if (Array.isArray(segments)) {
        for (const segment of segments) {
            if (Array.isArray(segment.segment)) {
                if (
                    !contentState.sponsorTimesSubmitting.some(
                        (s) => s.segment[0] === segment.segment[0] && s.segment[1] === s.segment[1]
                    )
                ) {
                    contentState.sponsorTimesSubmitting.push({
                        cid: getCid(),
                        segment: segment.segment,
                        UUID: generateUserID() as SegmentUUID,
                        category: segment.category ? segment.category : Config.config.defaultCategory,
                        actionType: segment.actionType ? segment.actionType : ActionType.Skip,
                        source: SponsorSourceType.Local,
                    });

                    pushed = true;
                }
            }
        }
    }

    if (pushed) {
        Config.local.unsubmittedSegments[getVideoID()] = contentState.sponsorTimesSubmitting;
        Config.forceLocalUpdate("unsubmittedSegments");
    }
}

// Generate and inject a stylesheet that creates CSS variables with configured category colors
function setCategoryColorCSSVariables() {
    let styleContainer = document.getElementById("sbCategoryColorStyle");
    if (!styleContainer) {
        styleContainer = document.createElement("style");
        styleContainer.id = "sbCategoryColorStyle";

        const head = document.head || document.documentElement;
        head.appendChild(styleContainer);
    }

    let css = ":root {";
    for (const [category, config] of Object.entries(Config.config.barTypes).concat(Object.entries(Config.config.dynamicSponsorTypes))) {
        css += `--sb-category-${category}: ${config.color};`;
        css += `--darkreader-bg--sb-category-${category}: ${config.color};`;

        const luminance = GenericUtils.getLuminance(config.color);
        css += `--sb-category-text-${category}: ${luminance > 128 ? "black" : "white"};`;
        css += `--darkreader-text--sb-category-text-${category}: ${luminance > 128 ? "black" : "white"};`;
    }
    css += "}";

    styleContainer.innerText = css;
}
