import SkipNoticeComponent from "./components/SkipNoticeComponent";
import Config from "./config";
import { Keybind, keybindEquals, keybindToString, StorageChangesObject } from "./config/config";
import { ContentContainer } from "./ContentContainerTypes";
import PreviewBar, { PreviewBarSegment } from "./js-components/previewBar";
import { SkipButtonControlBar } from "./js-components/skipButtonControlBar";
import { Message, MessageResponse, VoteResponse } from "./messageTypes";
import advanceSkipNotice from "./render/advanceSkipNotice";
import { CategoryPill } from "./render/CategoryPill";
import { ChapterVote } from "./render/ChapterVote";
import { DescriptionPortPill } from "./render/DescriptionPortPill";
import { DynamicListener, CommentListener } from "./render/DynamicAndCommentSponsorBlock";
import { setMessageNotice, showMessage } from "./render/MessageNotice";
import { PlayerButton } from "./render/PlayerButton";
import SkipNotice from "./render/SkipNotice";
import SubmissionNotice from "./render/SubmissionNotice";
import { FetchResponse } from "./requests/type/requestType";
import { getPortVideoByHash, postPortVideo, postPortVideoVote, updatePortedSegments } from "./requests/portVideo";
import { asyncRequestToServer } from "./requests/requests";
import { getSegmentsByVideoID } from "./requests/segments";
import { getVideoLabel } from "./requests/videoLabels";
import { checkPageForNewThumbnails, setupThumbnailListener } from "./thumbnail-utils/thumbnailManagement";
import {
    ActionType,
    BVID,
    Category,
    CategorySkipOption,
    ChannelIDInfo,
    ChannelIDStatus,
    NewVideoID,
    PageType,
    PortVideo,
    ScheduledTime,
    SegmentUUID,
    SkipToTimeParams,
    SponsorHideType,
    SponsorSourceType,
    SponsorTime,
    ToggleSkippable,
    VideoInfo,
    YTID,
} from "./types";
import Utils from "./utils";
import { isFirefox, isFirefoxOrSafari, isSafari, sleep, waitFor } from "./utils/";
import { AnimationUtils } from "./utils/animationUtils";
import { addCleanupListener, cleanPage } from "./utils/cleanup";
import { defaultPreviewTime } from "./utils/constants";
import { parseTargetTimeFromDanmaku } from "./utils/danmakusUtils";
import { findValidElement } from "./utils/dom";
import { durationEquals } from "./utils/duraionUtils";
import { importTimes } from "./utils/exporter";
import { getErrorMessage, getFormattedTime } from "./utils/formating";
import { GenericUtils } from "./utils/genericUtils";
import { getHash, getVideoIDHash, HashedValue } from "./utils/hash";
import { getCidMapFromWindow } from "./utils/injectedScriptMessageUtils";
import { logDebug } from "./utils/logger";
import { getControls, getHashParams, getProgressBar, isPlayingPlaylist } from "./utils/pageUtils";
import { getBilibiliVideoID } from "./utils/parseVideoID";
import { generateUserID } from "./utils/setup";
import { getStartTimeFromUrl } from "./utils/urlParser";
import {
    checkIfNewVideoID,
    checkVideoIDChange,
    detectPageType,
    getBvID,
    getChannelIDInfo,
    getCid,
    getPageType,
    getVideo,
    getVideoID,
    setupVideoModule,
    updateFrameRate,
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

    if ([PageType.Video, PageType.List, PageType.Dynamic, PageType.Channel, PageType.Opus].includes(detectPageType()) &&
        (Config.config.dynamicAndCommentSponsorBlocker && Config.config.commentSponsorBlock)
    ) CommentListener();
});

if ((document.hidden && getPageType() == PageType.Video) || getPageType() == PageType.List) {
    document.addEventListener("visibilitychange", () => videoElementChange(true, getVideo()), { once: true });
    window.addEventListener("mouseover", () => videoElementChange(true, getVideo()), { once: true });
}

const skipBuffer = 0.003;
// If this close to the end, skip to the end
const endTimeSkipBuffer = 0.5;

//was sponsor data found when doing SponsorsLookup
let sponsorDataFound = false;
//the actual sponsorTimes if loaded and UUIDs associated with them
let sponsorTimes: SponsorTime[] = [];
// List of open skip notices
const skipNotices: SkipNotice[] = [];
let advanceSkipNotices: advanceSkipNotice | null = null;
let activeSkipKeybindElement: ToggleSkippable = null;
let shownSegmentFailedToFetchWarning = false;
let selectedSegment: SegmentUUID | null = null;
let previewedSegment = false;

let portVideo: PortVideo = null;

// JSON video info
let videoInfo: VideoInfo = null;
// Locked Categories in this tab, like: ["sponsor","intro","outro"]
let lockedCategories: Category[] = [];
// Used to calculate a more precise "virtual" video time
const lastKnownVideoTime: { videoTime: number; preciseTime: number; fromPause: boolean; approximateDelay: number } = {
    videoTime: null,
    preciseTime: null,
    fromPause: false,
    approximateDelay: null,
};
// It resumes with a slightly later time on chromium
let lastTimeFromWaitingEvent: number = null;

// Skips are scheduled to ensure precision.
// Skips are rescheduled every seeking event.
// Skips are canceled every seeking event
let currentSkipSchedule: NodeJS.Timeout = null;
let currentSkipInterval: NodeJS.Timeout = null;
let currentVirtualTimeInterval: NodeJS.Timeout = null;
let currentadvanceSkipSchedule: NodeJS.Timeout = null;

/** Has the sponsor been skipped */
let sponsorSkipped: boolean[] = [];

let videoMuted = false; // Has it been attempted to be muted

// TODO: More robust way to check for page loaded
let headerLoaded = false;
setupPageLoadingListener();

setupVideoModule({ videoIDChange, channelIDChange, resetValues, videoElementChange });

// 首页等待页面加载完毕后再检测封面，避免干扰hydration
if (getPageType() !== PageType.Main) {
    setupThumbnailListener();
}
waitFor(() => getPageLoaded()).then(setupThumbnailListener);

setMessageNotice(false, getPageLoaded);

const playerButton = new PlayerButton(
    startOrEndTimingNewSegment,
    cancelCreatingSegment,
    clearSponsorTimes,
    openSubmissionMenu,
    openInfoMenu
);

/**
 *  根据页面元素加载状态判断页面是否加载完成
 */
async function setupPageLoadingListener() {
    // header栏会加载组件，登录后触发5次mutation，未登录触发4次mutation
    const header = await waitFor(() => document.querySelector("#biliMainHeader, .bili-header"), 10000, 100);
    let mutationCounter = 0;
    const headerObserver = new MutationObserver(async () => {
        mutationCounter += 1;
        if (mutationCounter >= 4) {
            headerObserver.disconnect();
            // 再等待500ms，确保页面加载完成
            await sleep(500);
            headerLoaded = true;
        }
    });
    headerObserver.observe(header, { childList: true, subtree: true });
}

export function getPageLoaded() {
    return headerLoaded;
}

//the video id of the last preview bar update
let lastPreviewBarUpdate: BVID;

// Is the video currently being switched
let switchingVideos = null;

// Used by the play and playing listeners to make sure two aren't
// called at the same time
let lastCheckTime = 0;
let lastCheckVideoTime = -1;

//is this channel whitelised from getting sponsors skipped
let channelWhitelisted = false;

let previewBar: PreviewBar = null;
// Skip to highlight button
let skipButtonControlBar: SkipButtonControlBar = null;
// For full video sponsors/selfpromo
let categoryPill: CategoryPill = null;

let descriptionPill: DescriptionPortPill = null;

/** Contains buttons created by `createButton()`. */
let playerButtons: Record<string, { button: HTMLButtonElement; image: HTMLImageElement }> = {};

addHotkeyListener();

/** Segments created by the user which have not yet been submitted. */
let sponsorTimesSubmitting: SponsorTime[] = [];
let loadedPreloadedSegment = false;

//becomes true when isInfoFound is called
//this is used to close the popup on Bilibili when the other popup opens
let popupInitialised = false;

let submissionNotice: SubmissionNotice = null;

let lastResponseStatus: number;
let lookupWaiting = false;

// Contains all of the functions and variables needed by the skip notice
const skipNoticeContentContainer: ContentContainer = () => ({
    vote,
    dontShowNoticeAgain,
    unskipSponsorTime,
    sponsorTimes,
    sponsorTimesSubmitting,
    skipNotices,
    advanceSkipNotices,
    sponsorVideoID: getVideoID(),
    reskipSponsorTime,
    updatePreviewBar,
    sponsorSubmissionNotice: submissionNotice,
    resetSponsorSubmissionNotice,
    updateEditButtonsOnPlayer: updateSegmentSubmitting,
    previewTime,
    videoInfo,
    getRealCurrentTime: getRealCurrentTime,
    lockedCategories,
    channelIDInfo: getChannelIDInfo(),
});

// value determining when to count segment as skipped and send telemetry to server (percent based)
const manualSkipPercentCount = 0.5;

//get messages from the background script and the popup
chrome.runtime.onMessage.addListener(messageListener);

function messageListener(
    request: Message,
    sender: unknown,
    sendResponse: (response: MessageResponse) => void
): void | boolean {
    //messages from popup script
    switch (request.message) {
        case "update":
            checkVideoIDChange();
            break;
        case "sponsorStart":
            startOrEndTimingNewSegment();

            sendResponse({
                creatingSegment: isSegmentCreationInProgress(),
            });

            break;
        case "isInfoFound":
            //send the sponsor times along with if it's found
            sendResponse({
                found: sponsorDataFound,
                status: lastResponseStatus,
                sponsorTimes: sponsorTimes,
                portVideo: portVideo,
                time: getVideo()?.currentTime ?? 0,
            });

            if (
                !request.updating &&
                popupInitialised &&
                document.getElementById("sponsorBlockPopupContainer") != null
            ) {
                //the popup should be closed now that another is opening
                closeInfoMenu();
            }

            popupInitialised = true;
            break;
        case "getVideoID":
            sendResponse({
                videoID: getVideoID(),
            });

            break;
        case "getChannelID":
            sendResponse({
                channelID: getChannelIDInfo().id,
            });

            break;
        case "isChannelWhitelisted":
            sendResponse({
                value: channelWhitelisted,
            });

            break;
        case "whitelistChange":
            channelWhitelisted = request.value;
            sponsorsLookup();

            break;
        case "submitTimes":
            openSubmissionMenu();
            break;
        case "refreshSegments":
            // update video on refresh if videoID invalid
            if (!getVideoID()) {
                checkVideoIDChange();
            }

            // if popup rescieves no response, or the videoID is invalid,
            // it will assume the page is not a video page and stop the refresh animation
            sendResponse({ hasVideo: getVideoID() != null });
            // fetch segments
            sponsorsLookup(false, true);

            break;
        case "unskip":
            unskipSponsorTime(
                sponsorTimes.find((segment) => segment.UUID === request.UUID),
                null,
                true
            );
            break;
        case "reskip":
            reskipSponsorTime(
                sponsorTimes.find((segment) => segment.UUID === request.UUID),
                true
            );
            break;
        case "selectSegment":
            selectSegment(request.UUID);
            break;
        case "submitVote":
            vote(request.type, request.UUID).then((response) => sendResponse(response));
            return true;
        case "hideSegment":
            utils.getSponsorTimeFromUUID(sponsorTimes, request.UUID).hidden = request.type;
            utils.addHiddenSegment(getVideoID(), request.UUID, request.type);
            updatePreviewBar();

            if (
                skipButtonControlBar?.isEnabled() &&
                sponsorTimesSubmitting.every(
                    (s) => s.hidden !== SponsorHideType.Visible || s.actionType !== ActionType.Poi
                )
            ) {
                skipButtonControlBar.disable();
            }
            break;
        case "closePopup":
            closeInfoMenu();
            break;
        case "copyToClipboard":
            navigator.clipboard.writeText(request.text);
            break;
        case "importSegments": {
            const importedSegments = importTimes(request.data, getVideo().duration);
            let addedSegments = false;
            for (const segment of importedSegments) {
                if (
                    !sponsorTimesSubmitting.some(
                        (s) =>
                            Math.abs(s.segment[0] - segment.segment[0]) < 1 &&
                            Math.abs(s.segment[1] - segment.segment[1]) < 1
                    )
                ) {
                    sponsorTimesSubmitting.push(segment);
                    addedSegments = true;
                }
            }

            if (addedSegments) {
                Config.local.unsubmittedSegments[getVideoID()] = sponsorTimesSubmitting;
                Config.forceLocalUpdate("unsubmittedSegments");

                updateSegmentSubmitting();
                updateSponsorTimesSubmitting(false);
                openSubmissionMenu();
            }

            sendResponse({
                importedSegments,
            });
            break;
        }
        case "keydown":
            (document.body || document).dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: request.key,
                    keyCode: request.keyCode,
                    code: request.code,
                    which: request.which,
                    shiftKey: request.shiftKey,
                    ctrlKey: request.ctrlKey,
                    altKey: request.altKey,
                    metaKey: request.metaKey,
                })
            );
            break;
        case "submitPortVideo":
            submitPortVideo(request.ytbID);
            break;
        case "votePortVideo":
            portVideoVote(request.UUID, request.vote);
            break;
        case "updatePortedSegments":
            updateSegments(request.UUID);
            break;
    }

    sendResponse({});
}

/**
 * Called when the config is updated
 */
function contentConfigUpdateListener(changes: StorageChangesObject) {
    for (const key in changes) {
        switch (key) {
            case "hideVideoPlayerControls":
            case "hideInfoButtonPlayerControls":
            case "hideDeleteButtonPlayerControls":
                updateVisibilityOfPlayerControlsButton();
                break;
            case "categorySelections":
                sponsorsLookup();
                break;
            case "barTypes":
                setCategoryColorCSSVariables();
                break;
            case "fullVideoSegments":
            case "fullVideoLabelsOnThumbnails":
                checkPageForNewThumbnails();
                break;
        }
    }
}

if (!Config.configSyncListeners.includes(contentConfigUpdateListener)) {
    Config.configSyncListeners.push(contentConfigUpdateListener);
}

function resetValues() {
    lastCheckTime = 0;
    lastCheckVideoTime = -1;
    previewedSegment = false;

    sponsorTimes = [];
    sponsorSkipped = [];
    lastResponseStatus = 0;
    shownSegmentFailedToFetchWarning = false;

    videoInfo = null;
    channelWhitelisted = false;
    lockedCategories = [];

    //empty the preview bar
    if (previewBar !== null) {
        previewBar.clear();
    }

    // resetDurationAfterSkip
    removeDurationAfterSkip();

    //reset sponsor data found check
    sponsorDataFound = false;

    if (switchingVideos === null) {
        // When first loading a video, it is not switching videos
        switchingVideos = false;
    } else {
        switchingVideos = true;
        logDebug("Setting switching videos to true (reset data)");
    }

    skipButtonControlBar?.disable();
    categoryPill?.resetSegment();

    for (let i = 0; i < skipNotices.length; i++) {
        skipNotices.pop()?.close();
    }

    if (advanceSkipNotices) {
        advanceSkipNotices.close();
        advanceSkipNotices = null;
    }
}

async function videoIDChange(): Promise<void> {
    //setup the preview bar
    if (previewBar === null) {
        waitFor(getControls).then(createPreviewBar);
    }

    // Notify the popup about the video change
    chrome.runtime.sendMessage({
        message: "videoChanged",
        videoID: getVideoID(),
        whitelisted: channelWhitelisted,
    });

    sponsorsLookup();
    checkPageForNewThumbnails();

    // Clear unsubmitted segments from the previous video
    sponsorTimesSubmitting = [];
    updateSponsorTimesSubmitting();

    // TODO use mutation observer to get the reloading of the video element
    // wait for the video player to load and ready
    await waitFor(() => document.querySelector(".bpx-player-loading-panel.bpx-state-loading"), 5000, 5);
    await waitFor(getProgressBar, 24 * 60 * 60, 500);

    // Make sure all player buttons are properly added
    updateVisibilityOfPlayerControlsButton();
    checkPreviewbarState();
    setupDescriptionPill();

    if ([PageType.Video, PageType.List, PageType.Dynamic, PageType.Channel, PageType.Opus].includes(detectPageType()) &&
        (Config.config.dynamicAndCommentSponsorBlocker && Config.config.commentSponsorBlock)
    ) CommentListener();
}

/**
 * Creates a preview bar on the video
 */
function createPreviewBar(): void {
    if (previewBar !== null) return;

    const progressElementOptions = [
        {
            // For Desktop Bilibili
            selector: ".bpx-player-progress",
            shadowSelector: ".bpx-player-shadow-progress-area",
            isVisibleCheck: true,
        },
    ];

    for (const option of progressElementOptions) {
        const allElements = document.querySelectorAll(option.selector) as NodeListOf<HTMLElement>;
        const parent = option.isVisibleCheck ? findValidElement(allElements) : allElements[0];
        const allshadowSelectorElements = document.querySelectorAll(option.shadowSelector) as NodeListOf<HTMLElement>;
        const shadowParent = allshadowSelectorElements[0];

        if (parent) {
            const chapterVote = new ChapterVote(voteAsync);
            previewBar = new PreviewBar(parent, shadowParent, chapterVote);
            updatePreviewBar();
            break;
        }
    }
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

function cancelSponsorSchedule(): void {
    logDebug("Pausing skipping");

    if (currentSkipSchedule !== null) {
        clearTimeout(currentSkipSchedule);
        currentSkipSchedule = null;
    }

    if (currentSkipInterval !== null) {
        clearInterval(currentSkipInterval);
        currentSkipInterval = null;
    }

    if (currentadvanceSkipSchedule !== null) {
        clearInterval(currentadvanceSkipSchedule);
        currentadvanceSkipSchedule = null;
    }
}

/**
 * @param currentTime Optional if you don't want to use the actual current time
 */
async function startSponsorSchedule(
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

    updateActiveSegment(currentTime);

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

        for (const notice of skipNotices) {
            // So that the notice can hide buttons
            notice.unmutedListener(currentTime);
        }
    }

    logDebug(`Ready to start skipping: ${skipInfo.index} at ${currentTime}`);
    if (skipInfo.index === -1) return;

    if (
        Config.config.disableSkipping ||
        channelWhitelisted ||
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
                // Don't include artifical scheduled segments (end times for mutes)
                skippingSegments.push(segment);
            }
        }
    }

    logDebug(
        `Next step in starting skipping: ${!shouldSkip(currentSkip)}, ${!sponsorTimesSubmitting?.some(
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
            sponsorTimesSubmitting?.some((segment) => segment.segment === currentSkip.segment)
        ) {
            if (forceVideoTime >= skipTime[0] - skipBuffer && forceVideoTime < skipTime[1]) {
                skipToTime({
                    v: getVideo(),
                    skipTime,
                    skippingSegments,
                    openNotice: skipInfo.openNotice,
                });

                // These are segments that start at the exact same time but need seperate notices
                for (const extra of skipInfo.extraIndexes) {
                    const extraSkip = skipInfo.array[extra];
                    if (shouldSkip(extraSkip)) {
                        skipToTime({
                            v: getVideo(),
                            skipTime: [extraSkip.scheduledTime, extraSkip.segment[1]],
                            skippingSegments: [extraSkip],
                            openNotice: skipInfo.openNotice,
                        });
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

                    // Only if not at the end of the video
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

        // Don't pretend to be earlier than we are, could result in loops
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

            // Use interval instead of timeout near the end to combat imprecise video time
            const startIntervalTime = forceStartIntervalTime || performance.now();
            const startVideoTime = Math.max(currentTime, getVideo().currentTime);
            delayTime = (skipTime?.[0] - startVideoTime) * 1000 * (1 / getVideo().playbackRate);

            let startWaitingForReportedTimeToChange = true;
            const reportedVideoTimeAtStart = getVideo().currentTime;
            logDebug(`Starting setInterval skipping ${getVideo().currentTime} to skip at ${skipTime[0]}`);

            if (currentSkipInterval !== null) clearInterval(currentSkipInterval);
            currentSkipInterval = setInterval(() => {
                // Estimate delay, but only take the current time right after a change
                // Current time remains the same for many "frames" on Firefox
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
                        // Workaround for more accurate skipping on Chromium
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
            // Schedule for right before to be more precise than normal timeout
            const offsetDelayTime = Math.max(0, delayTime - offset);
            currentSkipSchedule = setTimeout(skippingFunction, offsetDelayTime);

            if (
                Config.config.advanceSkipNotice &&
                Config.config.skipNoticeDurationBefore > 0 &&
                getVideo().currentTime < skippingSegments[0].segment[0] &&
                !sponsorTimesSubmitting?.some((segment) => segment.segment === currentSkip.segment) &&
                [ActionType.Skip, ActionType.Mute].includes(skippingSegments[0].actionType) &&
                shouldAutoSkip(skippingSegments[0]) &&
                !getVideo()?.paused
            ) {
                const maxPopupTime = Config.config.skipNoticeDurationBefore * 1000;
                const timeUntilPopup = Math.max(0, offsetDelayTime - maxPopupTime);
                const autoSkip = shouldAutoSkip(skippingSegments[0]);

                if (currentadvanceSkipSchedule) clearTimeout(currentadvanceSkipSchedule);
                currentadvanceSkipSchedule = setTimeout(() => {
                    createAdvanceSkipNotice([skippingSegments[0]], skipTime[0], autoSkip, false);
                    sessionStorage.setItem("SKIPPING", "true");
                }, timeUntilPopup);
            }
        }
    }
}

function checkDanmaku(text: string, offset: number) {
    const targetTime = parseTargetTimeFromDanmaku(text, getVirtualTime());
    if (targetTime === null) return;

    // [DEBUG]
    // console.debug("检测到空降弹幕: ", text, "请求跳转到: ", targetTime);

    const startTime = getVirtualTime() + offset;

    // ignore if the time is in the past
    if (targetTime < startTime + 5) return;
    if (targetTime > getVideo().duration) return;

    if (Config.config.checkTimeDanmakuSkip && isSegmentMarkedNearCurrentTime(startTime)) return;

    const skippingSegments: SponsorTime[] = [
        {
            cid: getCid(),
            actionType: ActionType.Skip,
            segment: [startTime, targetTime],
            source: SponsorSourceType.Danmaku,
            UUID: generateUserID() as SegmentUUID,
            category: "sponsor" as Category,
        },
    ];

    setTimeout(() => {
        skipToTime({
            v: getVideo(),
            skipTime: [startTime, targetTime],
            skippingSegments,
            openNotice: true,
            forceAutoSkip: Config.config.enableAutoSkipDanmakuSkip,
            unskipTime: startTime,
        });
        if (Config.config.enableMenuDanmakuSkip) {
            setTimeout(() => {
                if (!sponsorTimesSubmitting?.some((s) => s.segment[1] === skippingSegments[0].segment[1])) {
                    sponsorTimesSubmitting.push(skippingSegments[0]);
                }
                openSubmissionMenu();
            }, Config.config.skipNoticeDuration * 1000 + 500);
        }
    }, offset * 1000 - 100);
}

let danmakuObserver: MutationObserver = null;
const processedDanmaku = new Set<string>();

function danmakuForSkip() {
    if (!Config.config.enableDanmakuSkip || Config.config.disableSkipping) return;
    if (danmakuObserver) return;

    const targetNode = document.querySelector(".bpx-player-row-dm-wrap"); // 选择父节点
    const config = { attributes: true, subtree: true }; // 观察属性变化
    const callback = (mutationsList: MutationRecord[]) => {
        if (!Config.config.enableDanmakuSkip || Config.config.disableSkipping) return;
        if (targetNode.classList.contains("bili-danmaku-x-paused")) return;
        for (const mutation of mutationsList) {
            const target = mutation.target as HTMLElement;
            if (mutation.type === "attributes" && target.classList.contains("bili-danmaku-x-dm")) {
                const content = mutation.target.textContent;
                if (target.classList.contains("bili-danmaku-x-show")) {
                    if (!content || processedDanmaku.has(content)) {
                        continue;
                    }
                    processedDanmaku.add(content);
                    const offset = target.classList.contains("bili-danmaku-x-center") ? 0.3 : 1;
                    checkDanmaku(content, offset);
                } else {
                    if (!content || processedDanmaku.has(content)) {
                        processedDanmaku.delete(content);
                    }
                }
            }
        }
    };
    danmakuObserver = new MutationObserver(callback);
    danmakuObserver.observe(targetNode, config);
    addCleanupListener(() => {
        if (danmakuObserver) {
            danmakuObserver.disconnect();
            danmakuObserver = null;
            processedDanmaku.clear();
            return;
        }
    });
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

function getVirtualTime(): number {
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

function inMuteSegment(currentTime: number, includeOverlap: boolean): boolean {
    const checkFunction = (segment) =>
        segment.actionType === ActionType.Mute &&
        segment.hidden === SponsorHideType.Visible &&
        segment.segment[0] <= currentTime &&
        (segment.segment[1] > currentTime || (includeOverlap && segment.segment[1] + 0.02 > currentTime));
    return sponsorTimes?.some(checkFunction) || sponsorTimesSubmitting.some(checkFunction);
}

function isSegmentMarkedNearCurrentTime(currentTime: number, range: number = 5): boolean {
    const lowerBound = currentTime - range;
    const upperBound = currentTime + range;

    return sponsorTimes?.some((sponsorTime) => {
        const {
            segment: [startTime, endTime],
        } = sponsorTime;
        return startTime <= upperBound && endTime >= lowerBound;
    });
}

/**
 * This makes sure the videoID is still correct and if the sponsorTime is included
 */
async function incorrectVideoCheck(videoID?: string, sponsorTime?: SponsorTime): Promise<boolean> {
    const currentVideoID = await getBilibiliVideoID();
    const recordedVideoID = videoID || getVideoID();
    if (
        currentVideoID !== recordedVideoID ||
        (sponsorTime &&
            (!sponsorTimes ||
                !sponsorTimes?.some(
                    (time) => time.segment[0] === sponsorTime.segment[0] && time.segment[1] === sponsorTime.segment[1]
                )) &&
            !sponsorTimesSubmitting.some(
                (time) => time.segment[0] === sponsorTime.segment[0] && time.segment[1] === sponsorTime.segment[1]
            ))
    ) {
        // Something has really gone wrong
        console.error("[SponsorBlock] The videoID recorded when trying to skip is different than what it should be.");
        console.error("[SponsorBlock] VideoID recorded: " + recordedVideoID + ". Actual VideoID: " + currentVideoID);
        console.error(
            "[SponsorBlock] SponsorTime",
            sponsorTime,
            "sponsorTimes",
            sponsorTimes,
            "sponsorTimesSubmitting",
            sponsorTimesSubmitting
        );

        // Video ID change occured
        checkVideoIDChange();

        return true;
    } else {
        return false;
    }
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

        switchingVideos = false;

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

            if (switchingVideos || lastPausedAtZero) {
                switchingVideos = false;
                logDebug("Setting switching videos to false");

                // If already segments loaded before video, retry to skip starting segments
                if (sponsorTimes) startSkipScheduleCheckingForStartSponsors();
            }

            lastPausedAtZero = false;

            // Make sure it doesn't get double called with the playing event
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

            if (switchingVideos) {
                switchingVideos = false;
                logDebug("Setting switching videos to false");

                // If already segments loaded before video, retry to skip starting segments
                if (sponsorTimes) startSkipScheduleCheckingForStartSponsors();
            }

            // Make sure it doesn't get double called with the play event
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
            lastKnownVideoTime.fromPause = false;

            if (!video.paused) {
                // Reset lastCheckVideoTime
                lastCheckTime = Date.now();
                lastCheckVideoTime = video.currentTime;

                updateVirtualTime();
                clearWaitingTime();

                // Sometimes looped videos loop back to almost zero, but not quite
                if (video.loop && video.currentTime < 0.2) {
                    startSponsorSchedule(false, 0);
                } else {
                    startSponsorSchedule();
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
            lastCheckVideoTime = -1;
            lastCheckTime = 0;

            if (playbackRateCheckInterval) clearInterval(playbackRateCheckInterval);

            lastKnownVideoTime.videoTime = null;
            lastKnownVideoTime.preciseTime = null;
            updateWaitingTime();

            cancelSponsorSchedule();
        };
        const pauseListener = () => {
            lastKnownVideoTime.fromPause = true;

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

function updateVirtualTime() {
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

                // If there is lag, give it another shot at finding a good change time
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

function updateWaitingTime(): void {
    lastTimeFromWaitingEvent = getVideo().currentTime;
}

function clearWaitingTime(): void {
    lastTimeFromWaitingEvent = null;
}

function setupSkipButtonControlBar() {
    if (!skipButtonControlBar) {
        skipButtonControlBar = new SkipButtonControlBar({
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

    skipButtonControlBar.attachToPage();
}

function setupCategoryPill() {
    if (!categoryPill) {
        categoryPill = new CategoryPill();
    }

    categoryPill.attachToPage(voteAsync);
}

function setupDescriptionPill() {
    if (!descriptionPill) {
        descriptionPill = new DescriptionPortPill(
            getPortVideo,
            submitPortVideo,
            portVideoVote,
            updateSegments,
            sponsorsLookup
        );
    }
    descriptionPill.setupDescription(getVideoID());
}

async function updatePortVideoElements(newPortVideo: PortVideo) {
    portVideo = newPortVideo;
    // notify description pill
    waitFor(() => descriptionPill).then(() => descriptionPill.setPortVideoData(newPortVideo));

    // notify popup of port video changes
    chrome.runtime.sendMessage({
        message: "infoUpdated",
        found: sponsorDataFound,
        status: lastResponseStatus,
        sponsorTimes: sponsorTimes,
        portVideo: newPortVideo,
        time: getVideo()?.currentTime ?? 0,
    });
}

async function getPortVideo(videoId: NewVideoID, bypassCache = false) {
    const newPortVideo = await getPortVideoByHash(videoId, { bypassCache });
    if (newPortVideo?.UUID === portVideo?.UUID) return;
    portVideo = newPortVideo;

    updatePortVideoElements(portVideo);
}

async function submitPortVideo(ytbID: YTID): Promise<PortVideo> {
    const newPortVideo = await postPortVideo(getVideoID(), ytbID, getVideo()?.duration);
    portVideo = newPortVideo;
    updatePortVideoElements(portVideo);
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
    if (lookupWaiting) return;

    if (!getVideo()) {
        //there is still no video here
        await waitForVideo();

        lookupWaiting = true;
        setTimeout(() => {
            lookupWaiting = false;
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
    lastResponseStatus = segmentResponse?.status;

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
            sponsorDataFound = true;

            // Check if any old submissions should be kept
            if (sponsorTimes !== null && keepOldSubmissions) {
                for (let i = 0; i < sponsorTimes.length; i++) {
                    if (sponsorTimes[i].source === SponsorSourceType.Local) {
                        // This is a user submission, keep it
                        receivedSegments.push(sponsorTimes[i]);
                    }
                }
            }

            const oldSegments = sponsorTimes || [];
            sponsorTimes = receivedSegments;

            // Hide all submissions smaller than the minimum duration
            if (Config.config.minDuration !== 0) {
                for (const segment of sponsorTimes) {
                    const duration = segment.segment[1] - segment.segment[0];
                    if (duration > 0 && duration < Config.config.minDuration) {
                        segment.hidden = SponsorHideType.MinimumDuration;
                    }
                }
            }

            if (keepOldSubmissions) {
                for (const segment of oldSegments) {
                    const otherSegment = sponsorTimes.find((other) => segment.UUID === other.UUID);
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
                for (const segment of sponsorTimes) {
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
                lastPreviewBarUpdate == getVideoID() ||
                (lastPreviewBarUpdate == null && !isNaN(getVideo().duration))
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
        found: sponsorDataFound,
        status: lastResponseStatus,
        sponsorTimes: sponsorTimes,
        portVideo: portVideo,
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
                lockedCategories = categoriesResponse;
            }
        } catch (e) { } //eslint-disable-line no-empty
    }
}


/**
 * Only should be used when it is okay to skip a sponsor when in the middle of it
 *
 * Ex. When segments are first loaded
 */
function startSkipScheduleCheckingForStartSponsors() {
    // switchingVideos is ignored in Safari due to event fire order. See #1142
    if ((!switchingVideos || isSafari()) && sponsorTimes) {
        // See if there are any starting sponsors
        let startingSegmentTime = getStartTimeFromUrl(document.URL) || -1;
        let found = false;
        for (const time of sponsorTimes) {
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
            for (const time of sponsorTimesSubmitting) {
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

        // For highlight category
        const poiSegments = sponsorTimes
            .filter(
                (time) =>
                    time.segment[1] > getVideo().currentTime &&
                    time.actionType === ActionType.Poi &&
                    time.hidden === SponsorHideType.Visible
            )
            .sort((a, b) => b.segment[0] - a.segment[0]);
        for (const time of poiSegments) {
            const skipOption = utils.getCategorySelection(time.category)?.option;
            if (skipOption !== CategorySkipOption.ShowOverlay) {
                skipToTime({
                    v: getVideo(),
                    skipTime: time.segment,
                    skippingSegments: [time],
                    openNotice: true,
                    unskipTime: getVideo().currentTime,
                });
                if (skipOption === CategorySkipOption.AutoSkip) break;
            }
        }

        const fullVideoSegment = sponsorTimes.filter((time) => time.actionType === ActionType.Full)[0];
        if (fullVideoSegment) {
            waitFor(() => categoryPill).then(() => {
                categoryPill?.setSegment(fullVideoSegment);
            });
        }

        if (startingSegmentTime !== -1) {
            startSponsorSchedule(undefined, startingSegmentTime);
        } else {
            startSponsorSchedule();
        }
    }
}

function selectSegment(UUID: SegmentUUID): void {
    selectedSegment = UUID;
    updatePreviewBar();
}

function updatePreviewBar(): void {
    if (previewBar === null) return;
    if (getVideo() === null) return;

    const hashParams = getHashParams();
    const requiredSegment = (hashParams?.requiredSegment as SegmentUUID) || undefined;
    const previewBarSegments: PreviewBarSegment[] = [];
    if (sponsorTimes) {
        sponsorTimes.forEach((segment) => {
            if (segment.hidden !== SponsorHideType.Visible) return;

            previewBarSegments.push({
                segment: segment.segment as [number, number],
                category: segment.category,
                actionType: segment.actionType,
                unsubmitted: false,
                showLarger: segment.actionType === ActionType.Poi,
                source: segment.source,
                requiredSegment:
                    requiredSegment && (segment.UUID === requiredSegment || segment.UUID?.startsWith(requiredSegment)),
                selectedSegment: selectedSegment && segment.UUID === selectedSegment,
            });
        });
    }

    sponsorTimesSubmitting.forEach((segment) => {
        previewBarSegments.push({
            segment: segment.segment as [number, number],
            category: segment.category,
            actionType: segment.actionType,
            unsubmitted: true,
            showLarger: segment.actionType === ActionType.Poi,
            source: segment.source,
        });
    });

    previewBar.set(
        previewBarSegments.filter((segment) => segment.actionType !== ActionType.Full),
        getVideo()?.duration
    );
    if (getVideo()) updateActiveSegment(getVideo().currentTime);

    // retry create buttons in case the video is not ready
    updateVisibilityOfPlayerControlsButton();

    removeDurationAfterSkip();
    if (Config.config.showTimeWithSkips) {
        const skippedDuration = utils.getTimestampsDuration(
            previewBarSegments.filter(({ actionType }) => actionType !== ActionType.Mute).map(({ segment }) => segment)
        );

        showTimeWithoutSkips(skippedDuration);
    }

    // Update last video id
    lastPreviewBarUpdate = getVideoID();
}

//checks if this channel is whitelisted, should be done only after the channelID has been loaded
async function channelIDChange(channelIDInfo: ChannelIDInfo) {
    const whitelistedChannels = Config.config.whitelistedChannels;

    //see if this is a whitelisted channel
    if (
        whitelistedChannels != undefined &&
        channelIDInfo.status === ChannelIDStatus.Found &&
        whitelistedChannels.includes(channelIDInfo.id)
    ) {
        channelWhitelisted = true;
    }

    // check if the start of segments were missed
    if (Config.config.forceChannelCheck && sponsorTimes?.length > 0) startSkipScheduleCheckingForStartSponsors();
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

function checkPreviewbarState(): void {
    if (previewBar && !utils.findReferenceNode()?.contains(previewBar.container)) {
        previewBar.remove();
        previewBar = null;
        removeDurationAfterSkip();
    }

    // wait until the page is active to create the preview bar
    waitFor(() => !document.hidden, 24 * 60 * 60, 500).then(createPreviewBar);
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
        sponsorTimes,
        includeIntersectingSegments,
        includeNonIntersectingSegments
    );
    const { scheduledTimes: sponsorStartTimesAfterCurrentTime } = getStartTimes(
        sponsorTimes,
        includeIntersectingSegments,
        includeNonIntersectingSegments,
        currentTime,
        true
    );

    // This is an array in-case multiple segments have the exact same start time
    const minSponsorTimeIndexes = GenericUtils.indexesOf(
        sponsorStartTimes,
        Math.min(...sponsorStartTimesAfterCurrentTime)
    );
    // Find auto skipping segments if possible, sort by duration otherwise
    const minSponsorTimeIndex =
        minSponsorTimeIndexes.sort(
            (a, b) =>
                autoSkipSorter(submittedArray[a]) - autoSkipSorter(submittedArray[b]) ||
                submittedArray[a].segment[1] -
                submittedArray[a].segment[0] -
                (submittedArray[b].segment[1] - submittedArray[b].segment[0])
        )[0] ?? -1;
    // Store extra indexes for the non-auto skipping segments if others occur at the exact same start time
    const extraIndexes = minSponsorTimeIndexes.filter(
        (i) => i !== minSponsorTimeIndex && autoSkipSorter(submittedArray[i]) !== 0
    );

    const endTimeIndex = getLatestEndTimeIndex(submittedArray, minSponsorTimeIndex);

    const { includedTimes: unsubmittedArray, scheduledTimes: unsubmittedSponsorStartTimes } = getStartTimes(
        sponsorTimesSubmitting,
        includeIntersectingSegments,
        includeNonIntersectingSegments
    );
    const { scheduledTimes: unsubmittedSponsorStartTimesAfterCurrentTime } = getStartTimes(
        sponsorTimesSubmitting,
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
            extraIndexes, // Segments at same time that need seperate notices
            openNotice: true,
        };
    } else {
        return {
            array: unsubmittedArray,
            index: minUnsubmittedSponsorTimeIndex,
            endIndex: previewEndTimeIndex,
            extraIndexes: [], // No manual things for unsubmitted
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
 *
 * @param sponsorTimes
 * @param index Index of the given sponsor
 * @param hideHiddenSponsors
 */
function getLatestEndTimeIndex(sponsorTimes: SponsorTime[], index: number, hideHiddenSponsors = true): number {
    // Only combine segments for AutoSkip
    if (index == -1 || !shouldAutoSkip(sponsorTimes[index]) || sponsorTimes[index].actionType !== ActionType.Skip) {
        return index;
    }

    // Default to the normal endTime
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
            // Overlapping segment
            latestEndTimeIndex = i;
        }
    }

    // Keep going if required
    if (latestEndTimeIndex !== index) {
        latestEndTimeIndex = getLatestEndTimeIndex(sponsorTimes, latestEndTimeIndex, hideHiddenSponsors);
    }

    return latestEndTimeIndex;
}

/**
 * Gets just the start times from a sponsor times array.
 * Optionally specify a minimum
 *
 * @param sponsorTimes
 * @param minimum
 * @param hideHiddenSponsors
 * @param includeIntersectingSegments If true, it will include segments that start before
 *  the current time, but end after
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
                shouldSkip(segment))) && // Only include intersecting skippable segments
        (!hideHiddenSponsors || segment.hidden === SponsorHideType.Visible) &&
        segment.segment.length === 2 &&
        segment.actionType !== ActionType.Poi &&
        segment.actionType !== ActionType.Full;

    const possibleTimes = sponsorTimes.map((sponsorTime) => ({
        ...sponsorTime,
        scheduledTime: sponsorTime.segment[0],
    }));

    // Schedule at the end time to know when to unmute and remove title from seek bar
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

/**
 * Skip to exact time in a video and autoskips
 *
 * @param time
 */
function previewTime(time: number, unpause = true) {
    previewedSegment = true;
    getVideo().currentTime = time;

    // Unpause the video if needed
    if (unpause && getVideo().paused) {
        getVideo().play();
    }
}

//send telemetry and count skip
function sendTelemetryAndCount(skippingSegments: SponsorTime[], secondsSkipped: number, fullSkip: boolean) {
    for (const segment of skippingSegments) {
        if (!previewedSegment && sponsorTimesSubmitting.some((s) => s.segment === segment.segment)) {
            // Count that as a previewed segment
            previewedSegment = true;
        }
    }

    if (
        !Config.config.trackViewCount ||
        (!Config.config.trackViewCountInPrivate && chrome.extension.inIncognitoContext)
    )
        return;

    let counted = false;
    for (const segment of skippingSegments) {
        const index = sponsorTimes?.findIndex((s) => s.segment === segment.segment);
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

//skip from the start time to the end time for a certain index sponsor time
function skipToTime({ v, skipTime, skippingSegments, openNotice, forceAutoSkip, unskipTime }: SkipToTimeParams): void {
    if (Config.config.disableSkipping) return;

    let autoSkip: boolean;
    if (sessionStorage.getItem("SKIPPING") === "false") {
        sessionStorage.setItem("SKIPPING", "null");
        autoSkip = false;
    } else {
        // There will only be one submission if it is manual skip
        autoSkip = forceAutoSkip || shouldAutoSkip(skippingSegments[0]);
    }

    const isSubmittingSegment = sponsorTimesSubmitting.some((time) => time.segment === skippingSegments[0].segment);

    if ((autoSkip || isSubmittingSegment) && v.currentTime !== skipTime[1]) {
        switch (skippingSegments[0].actionType) {
            case ActionType.Poi:
            case ActionType.Skip: {
                // Fix for looped videos not working when skipping to the end #426
                // for some reason you also can't skip to 1 second before the end
                if (v.loop && v.duration > 1 && skipTime[1] >= v.duration - 1) {
                    v.currentTime = 0;
                } else if (
                    v.duration > 1 &&
                    skipTime[1] >= v.duration &&
                    (navigator.vendor === "Apple Computer, Inc." || isPlayingPlaylist())
                ) {
                    // MacOS will loop otherwise #1027
                    // Sometimes playlists loop too #1804
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
                        // Make sure not to mute if skipping into a mute segment
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

    if (autoSkip && Config.config.audioNotificationOnSkip && !isSubmittingSegment && !getVideo()?.muted) {
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
        waitFor(() => skipButtonControlBar).then(() => {
            skipButtonControlBar.enable(skippingSegments[0]);
            if (Config.config.skipKeybind == null) skipButtonControlBar.setShowKeybindHint(false);

            activeSkipKeybindElement?.setShowKeybindHint(false);
            activeSkipKeybindElement = skipButtonControlBar;
        });
    } else {
        if (openNotice) {
            //send out the message saying that a sponsor message was skipped
            if (!Config.config.dontShowNotice || !autoSkip) {
                createSkipNotice(skippingSegments, autoSkip, unskipTime, false);
            } else if (autoSkip) {
                activeSkipKeybindElement?.setShowKeybindHint(false);
                activeSkipKeybindElement = {
                    setShowKeybindHint: () => { },
                    toggleSkip: () => {
                        createSkipNotice(skippingSegments, autoSkip, unskipTime, true);

                        unskipSponsorTime(skippingSegments[0], unskipTime);
                    },
                };
            }
        }
    }

    //send telemetry that a this sponsor was skipped
    if (autoSkip || isSubmittingSegment) sendTelemetryAndCount(skippingSegments, skipTime[1] - skipTime[0], true);
}

function createSkipNotice(
    skippingSegments: SponsorTime[],
    autoSkip: boolean,
    unskipTime: number,
    startReskip: boolean
) {
    for (const skipNotice of skipNotices) {
        if (
            skippingSegments.length === skipNotice.segments.length &&
            skippingSegments.every((segment) => skipNotice.segments.some((s) => s.UUID === segment.UUID))
        ) {
            // Skip notice already exists
            return;
        }
    }

    const advanceSkipNoticeShow = !!advanceSkipNotices;
    const newSkipNotice = new SkipNotice(
        skippingSegments,
        autoSkip,
        skipNoticeContentContainer,
        () => {
            advanceSkipNotices?.close();
            advanceSkipNotices = null;
        },
        unskipTime,
        startReskip,
        advanceSkipNoticeShow
    );
    if (Config.config.skipKeybind == null) newSkipNotice.setShowKeybindHint(false);
    skipNotices.push(newSkipNotice);

    activeSkipKeybindElement?.setShowKeybindHint(false);
    activeSkipKeybindElement = newSkipNotice;
}

function createAdvanceSkipNotice(
    skippingSegments: SponsorTime[],
    unskipTime: number,
    autoSkip: boolean,
    startReskip: boolean
) {
    if (advanceSkipNotices && !advanceSkipNotices.closed && advanceSkipNotices.sameNotice(skippingSegments)) {
        return;
    }

    advanceSkipNotices?.close();
    advanceSkipNotices = new advanceSkipNotice(
        skippingSegments,
        skipNoticeContentContainer,
        unskipTime,
        autoSkip,
        startReskip
    );
    if (Config.config.skipKeybind == null) advanceSkipNotices.setShowKeybindHint(false);

    activeSkipKeybindElement?.setShowKeybindHint(false);
    activeSkipKeybindElement = advanceSkipNotices;
}

function unskipSponsorTime(segment: SponsorTime, unskipTime: number = null, forceSeek = false) {
    if (segment.actionType === ActionType.Mute) {
        getVideo().muted = false;
        videoMuted = false;
    }

    if (forceSeek || segment.actionType === ActionType.Skip) {
        //add a tiny bit of time to make sure it is not skipped again
        getVideo().currentTime = unskipTime ?? segment.segment[0] + 0.001;
    }
}

function reskipSponsorTime(segment: SponsorTime, forceSeek = false) {
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

function shouldAutoSkip(segment: SponsorTime): boolean {
    // danmaku segments are controlled by config
    if (segment.source === SponsorSourceType.Danmaku) {
        return Config.config.enableAutoSkipDanmakuSkip;
    }
    // Check if manual skip on full video is disabled or there is no full video segment for this category
    if (
        Config.config.manualSkipOnFullVideo &&
        sponsorTimes?.some((s) => s.category === segment.category && s.actionType === ActionType.Full)
    ) {
        return false;
    }

    const categoryOption = utils.getCategorySelection(segment.category)?.option;

    // Check if the category is set to AutoSkip
    if (categoryOption === CategorySkipOption.AutoSkip) {
        return true;
    }
    // Check if auto skip on music videos is enabled and there's a "music_offtopic" segment, and the current segment is of type Skip
    else if (
        Config.config.autoSkipOnMusicVideos &&
        sponsorTimes?.some((s) => s.category === "music_offtopic") &&
        segment.actionType === ActionType.Skip
    ) {
        return true;
    }
    // Check if this segment is in the submitting segments
    else if (sponsorTimesSubmitting.some((s) => s.segment === segment.segment)) {
        return true;
    }

    // Do not auto-skip in other cases
    return false;
}

function shouldSkip(segment: SponsorTime): boolean {
    return (
        (segment.actionType !== ActionType.Full &&
            segment.source !== SponsorSourceType.YouTube &&
            utils.getCategorySelection(segment.category)?.option !== CategorySkipOption.ShowOverlay) ||
        (Config.config.autoSkipOnMusicVideos &&
            sponsorTimes?.some((s) => s.category === "music_offtopic") &&
            segment.actionType === ActionType.Skip)
    );
}

/** Creates any missing buttons on the player and updates their visiblity. */
async function updateVisibilityOfPlayerControlsButton(): Promise<void> {
    // Not on a proper video yet
    if (!getVideoID()) return;

    playerButtons = await playerButton.createButtons();

    updateSegmentSubmitting();
}

/** Updates the visibility of buttons on the player related to creating segments. */
function updateSegmentSubmitting(): void {
    // Don't try to update the buttons if we aren't on a Bilibili video page
    if (!getVideoID()) return;
    playerButton.updateSegmentSubmitting(sponsorTimesSubmitting);
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
        sponsorTimesSubmitting.push({
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
    Config.local.unsubmittedSegments[getVideoID()] = sponsorTimesSubmitting;
    Config.forceLocalUpdate("unsubmittedSegments");

    // Make sure they know if someone has already submitted something it while they were watching
    sponsorsLookup(true, true);

    updateSegmentSubmitting();
    updateSponsorTimesSubmitting(false);

    if (
        lastResponseStatus !== 200 &&
        lastResponseStatus !== 404 &&
        !shownSegmentFailedToFetchWarning &&
        Config.config.showSegmentFailedToFetchWarning
    ) {
        showMessage(chrome.i18n.getMessage("segmentFetchFailureWarning"), "warning");

        shownSegmentFailedToFetchWarning = true;
    }
}

function getIncompleteSegment(): SponsorTime {
    return sponsorTimesSubmitting[sponsorTimesSubmitting.length - 1];
}

/** Is the latest submitting segment incomplete */
function isSegmentCreationInProgress(): boolean {
    const segment = getIncompleteSegment();
    return segment && segment?.segment?.length !== 2;
}

function cancelCreatingSegment() {
    if (isSegmentCreationInProgress()) {
        if (sponsorTimesSubmitting.length > 1) {
            // If there's more than one segment: remove last
            sponsorTimesSubmitting.pop();
            Config.local.unsubmittedSegments[getVideoID()] = sponsorTimesSubmitting;
        } else {
            // Otherwise delete the video entry & close submission menu
            resetSponsorSubmissionNotice();
            sponsorTimesSubmitting = [];
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
        sponsorTimesSubmitting = [];

        for (const segmentTime of segmentTimes) {
            sponsorTimesSubmitting.push({
                cid: getCid(),
                segment: segmentTime.segment,
                UUID: segmentTime.UUID,
                category: segmentTime.category,
                actionType: segmentTime.actionType,
                source: segmentTime.source,
            });
        }

        if (sponsorTimesSubmitting.length > 0) {
            // Assume they already previewed a segment
            previewedSegment = true;
        }
    }

    updatePreviewBar();

    // Restart skipping schedule
    if (getVideo() !== null) startSponsorSchedule();

    if (submissionNotice !== null) {
        submissionNotice.update();
    }

    checkForPreloadedSegment();
}

function openInfoMenu() {
    if (document.getElementById("sponsorBlockPopupContainer") != null) {
        //it's already added
        return;
    }

    popupInitialised = false;

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
        sponsorTimesSubmitting = [];

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
                skipNotice.afterVote.bind(skipNotice)(utils.getSponsorTimeFromUUID(sponsorTimes, UUID), type, category);
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
    const sponsorIndex = utils.getSponsorIndexFromUUID(sponsorTimes, UUID);

    // Don't vote for preview sponsors
    if (sponsorIndex == -1 || sponsorTimes[sponsorIndex].source !== SponsorSourceType.Server)
        return Promise.resolve(undefined);

    // See if the local time saved count and skip count should be saved
    if ((type === 0 && sponsorSkipped[sponsorIndex]) || (type === 1 && !sponsorSkipped[sponsorIndex])) {
        let factor = 1;
        if (type == 0) {
            factor = -1;

            sponsorSkipped[sponsorIndex] = false;
        }

        // Count this as a skip
        Config.config.minutesSaved =
            Config.config.minutesSaved +
            (factor * (sponsorTimes[sponsorIndex].segment[1] - sponsorTimes[sponsorIndex].segment[0])) / 60;

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
                    const segment = utils.getSponsorTimeFromUUID(sponsorTimes, UUID);
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
    submissionNotice?.close(callRef);
    submissionNotice = null;
}

function closeSubmissionMenu() {
    submissionNotice?.close();
    submissionNotice = null;
}

function openSubmissionMenu() {
    if (submissionNotice !== null) {
        closeSubmissionMenu();
        return;
    }

    if (sponsorTimesSubmitting !== undefined && sponsorTimesSubmitting.length > 0) {
        submissionNotice = new SubmissionNotice(skipNoticeContentContainer, sendSubmitMessage);
        // Add key bind for jumpping to next frame, for easier sponsor time editting
        document.addEventListener("keydown", seekFrameByKeyPressListener);
    }
}

function previewRecentSegment() {
    if (sponsorTimesSubmitting !== undefined && sponsorTimesSubmitting.length > 0) {
        previewTime(sponsorTimesSubmitting[sponsorTimesSubmitting.length - 1].segment[0] - defaultPreviewTime);

        if (submissionNotice) {
            submissionNotice.scrollToBottom();
        }
    }
}

function submitSegments() {
    if (sponsorTimesSubmitting !== undefined && sponsorTimesSubmitting.length > 0 && submissionNotice !== null) {
        submissionNotice.submit();
    }
}

//send the message to the background js
//called after all the checks have been made that it's okay to do so
async function sendSubmitMessage(): Promise<boolean> {
    // TODO: add checks for premiere videos

    if (
        !previewedSegment &&
        !sponsorTimesSubmitting.every(
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
    playerButtons.submit.image.src = chrome.runtime.getURL("icons/PlayerUploadIconSponsorBlocker.svg");
    const stopAnimation = AnimationUtils.applyLoadingAnimation(playerButtons.submit.button, 1, () =>
        updateSegmentSubmitting()
    );

    //check if a sponsor exceeds the duration of the video
    for (let i = 0; i < sponsorTimesSubmitting.length; i++) {
        if (sponsorTimesSubmitting[i].segment[1] > getVideo().duration) {
            sponsorTimesSubmitting[i].segment[1] = getVideo().duration;
        }
    }

    //update sponsorTimes
    Config.local.unsubmittedSegments[getVideoID()] = sponsorTimesSubmitting;
    Config.forceLocalUpdate("unsubmittedSegments");

    // Check to see if any of the submissions are below the minimum duration set
    if (Config.config.minDuration > 0) {
        for (let i = 0; i < sponsorTimesSubmitting.length; i++) {
            const duration = sponsorTimesSubmitting[i].segment[1] - sponsorTimesSubmitting[i].segment[0];
            if (duration > 0 && duration < Config.config.minDuration) {
                const confirmShort =
                    chrome.i18n.getMessage("shortCheck") + "\n\n" + getSegmentsMessage(sponsorTimesSubmitting);

                if (!confirm(confirmShort)) return false;
            }
        }
    }

    const response = await asyncRequestToServer("POST", "/api/skipSegments", {
        videoID: getBvID(),
        cid: getCid(),
        userID: Config.config.userID,
        segments: sponsorTimesSubmitting,
        videoDuration: getVideo()?.duration,
        userAgent: `${chrome.runtime.id}/v${chrome.runtime.getManifest().version}`,
    });

    if (response.status === 200) {
        stopAnimation();

        // Remove segments from storage since they've already been submitted
        delete Config.local.unsubmittedSegments[getVideoID()];
        Config.forceLocalUpdate("unsubmittedSegments");

        const newSegments = sponsorTimesSubmitting;
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
        sponsorTimes = (sponsorTimes || []).concat(newSegments).sort((a, b) => a.segment[0] - b.segment[0]);

        // Increase contribution count
        Config.config.sponsorTimesContributed = Config.config.sponsorTimesContributed + sponsorTimesSubmitting.length;

        // New count just used to see if a warning "Read The Guidelines!!" message needs to be shown
        // One per time submitting
        Config.config.submissionCountSinceCategories = Config.config.submissionCountSinceCategories + 1;

        // Empty the submitting times
        sponsorTimesSubmitting = [];

        updatePreviewBar();

        const fullVideoSegment = sponsorTimes.filter((time) => time.actionType === ActionType.Full)[0];
        if (fullVideoSegment) {
            waitFor(() => categoryPill).then(() => {
                categoryPill?.setSegment(fullVideoSegment);
            });
            // refresh the video labels cache
            getVideoLabel(getVideoID(), true);
        }

        return true;
    } else {
        // Show that the upload failed
        playerButtons.submit.button.style.animation = "unset";
        playerButtons.submit.image.src = chrome.runtime.getURL("icons/PlayerUploadFailedIconSponsorBlocker.svg");

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

function updateActiveSegment(currentTime: number): void {
    previewBar?.updateChapterText(sponsorTimes, sponsorTimesSubmitting, currentTime);

    chrome.runtime.sendMessage({
        message: "time",
        time: currentTime,
    });
}

function addHotkeyListener(): void {
    document.addEventListener("keydown", hotkeyListener);

    const onLoad = () => {
        // Allow us to stop propagation to Bilibili by being deeper
        document.removeEventListener("keydown", hotkeyListener);
        document.body.addEventListener("keydown", hotkeyListener);

        addCleanupListener(() => {
            document.body.removeEventListener("keydown", hotkeyListener);
        });
    };

    if (document.readyState === "complete") {
        onLoad();
    } else {
        document.addEventListener("DOMContentLoaded", onLoad);
    }
}

function hotkeyListener(e: KeyboardEvent): void {
    if (
        ["textarea", "input"].includes(document.activeElement?.tagName?.toLowerCase()) ||
        document.activeElement?.id?.toLowerCase()?.includes("editable")
    )
        return;

    const key: Keybind = {
        key: e.key,
        code: e.code,
        alt: e.altKey,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
    };

    const skipKey = Config.config.skipKeybind;
    const skipToHighlightKey = Config.config.skipToHighlightKeybind;
    const closeSkipNoticeKey = Config.config.closeSkipNoticeKeybind;
    const startSponsorKey = Config.config.startSponsorKeybind;
    const submitKey = Config.config.actuallySubmitKeybind;
    const previewKey = Config.config.previewKeybind;
    const openSubmissionMenuKey = Config.config.submitKeybind;

    if (keybindEquals(key, skipKey)) {
        if (activeSkipKeybindElement) {
            activeSkipKeybindElement.toggleSkip.call(activeSkipKeybindElement);

            /*
             * 视频播放器全屏或网页全屏时，快捷键`Enter`会聚焦到弹幕输入框
             * 这里阻止了使用`Enter`跳过赞助片段时播放器的默认行为
             */
            if (key.key === 'Enter') {
                const currentTime: number | null = document.querySelector<HTMLVideoElement>(".bpx-player-video-wrap video")?.currentTime ?? null;
                if (currentTime) {
                    const inSponsorRange = sponsorTimes.some(({ segment: [start, end] }) => start <= currentTime && end >= currentTime);
                    if (inSponsorRange) {
                        utils.biliBiliPlayerDanmakuInputBlur();
                    }
                }

            }
        }

        return;
    } else if (keybindEquals(key, skipToHighlightKey)) {
        if (skipButtonControlBar) {
            skipButtonControlBar.toggleSkip.call(skipButtonControlBar);
        }

        return;
    } else if (keybindEquals(key, closeSkipNoticeKey)) {
        for (let i = 0; i < skipNotices.length; i++) {
            skipNotices.pop().close();
        }

        return;
    } else if (keybindEquals(key, startSponsorKey)) {
        startOrEndTimingNewSegment();
        return;
    } else if (keybindEquals(key, submitKey)) {
        submitSegments();
        return;
    } else if (keybindEquals(key, openSubmissionMenuKey)) {
        e.preventDefault();

        openSubmissionMenu();
        return;
    } else if (keybindEquals(key, previewKey)) {
        previewRecentSegment();
        return;
    }
}

/**
 * Hot keys to jump to the next or previous frame, for easier segment time editting
 * only effective when the SubmissionNotice is open
 *
 * @param key keydown event
 */
export async function seekFrameByKeyPressListener(key) {
    const vid = getVideo();
    const frameRate = await updateFrameRate();
    if (!vid.paused) return;

    if (keybindEquals(key, Config.config.nextFrameKeybind)) {
        // next frame
        vid.currentTime += 1 / frameRate;
    } else if (keybindEquals(key, Config.config.previousFrameKeybind)) {
        // previous frame
        vid.currentTime -= 1 / frameRate;
    }
}

const durationID = "sponsorBlockDurationAfterSkips";
function showTimeWithoutSkips(skippedDuration: number): void {
    if (isNaN(skippedDuration) || skippedDuration < 0) {
        skippedDuration = 0;
    }

    // Video player time display
    const display = document.querySelector(".bpx-player-ctrl-time-label") as HTMLDivElement;
    if (!display) return;

    let duration = document.getElementById(durationID);

    // Create span if needed
    if (duration === null) {
        duration = document.createElement("span");
        duration.id = durationID;
        display.appendChild(duration);
    }

    const durationAfterSkips = getFormattedTime(getVideo()?.duration - skippedDuration);

    const refreshDurationTextWidth = () => {
        // some hacks to change the min-width of the time control area,
        // so it won't overlap with chapters on the right
        display.style.width = "auto";
        display.parentElement.style.minWidth = `${display.clientWidth - 11}px`;
    };

    if (durationAfterSkips != null && skippedDuration > 0) {
        duration.innerText = " (" + durationAfterSkips + ")";

        refreshDurationTextWidth();
        // re-calculate text position after entering and exiting full screen
        window.addEventListener("fullscreenchange", refreshDurationTextWidth);
    }
}

function removeDurationAfterSkip() {
    const duration = document.getElementById(durationID);
    duration?.remove();
}

function checkForPreloadedSegment() {
    if (loadedPreloadedSegment) return;

    loadedPreloadedSegment = true;
    const hashParams = getHashParams();

    let pushed = false;
    const segments = hashParams.segments;
    if (Array.isArray(segments)) {
        for (const segment of segments) {
            if (Array.isArray(segment.segment)) {
                if (
                    !sponsorTimesSubmitting.some(
                        (s) => s.segment[0] === segment.segment[0] && s.segment[1] === s.segment[1]
                    )
                ) {
                    sponsorTimesSubmitting.push({
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
        Config.local.unsubmittedSegments[getVideoID()] = sponsorTimesSubmitting;
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
