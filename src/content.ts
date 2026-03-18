import Config from "./config";
import { ContentContainer } from "./ContentContainerTypes";
import {
    contentState,
    getPageLoaded,
    setupPageLoadingListener,
} from "./content/state";
import { initDanmakuSkip } from "./content/danmakuSkip";
import { initVideoListeners, resetVideoListenerState, setupVideoListeners } from "./content/videoListeners";
import {
    checkPreviewbarState,
    createPreviewBar,
    getPreviewBar,
    initPreviewBarManager,
    removeDurationAfterSkip,
    selectSegment,
    updateActiveSegment,
    updatePreviewBar,
} from "./content/previewBarManager";
import {
    getVirtualTime,
    initSkipScheduler,
    isSegmentMarkedNearCurrentTime,
    previewTime,
    resetSponsorSkipped,
    reskipSponsorTime,
    skipToTime,
    startSkipScheduleCheckingForStartSponsors,
    startSponsorSchedule,
    unskipSponsorTime,
} from "./content/skipScheduler";
import { initMessageHandler, setupMessageListener } from "./content/messageHandler";
import { addHotkeyListener, initHotkeyHandler, seekFrameByKeyPressListener } from "./content/hotkeyHandler";
import {
    cancelCreatingSegment,
    clearSponsorTimes,
    closeInfoMenu,
    dontShowNoticeAgain,
    getCategoryPill,
    getRealCurrentTime,
    getSkipButtonControlBar,
    getSubmissionNotice,
    initSegmentSubmission,
    isSegmentCreationInProgress,
    openInfoMenu,
    openSubmissionMenu,
    portVideoVote,
    previewRecentSegment,
    resetSponsorSubmissionNotice,
    setupCategoryPill,
    setupDescriptionPill,
    setupSkipButtonControlBar,
    sponsorsLookup,
    startOrEndTimingNewSegment,
    submitPortVideo,
    submitSegments,
    updateSegments,
    updateSegmentSubmitting,
    updateSponsorTimesSubmitting,
    updateVisibilityOfPlayerControlsButton,
    vote,
    voteAsync,
} from "./content/segmentSubmission";
import { DynamicListener, CommentListener } from "./render/DynamicAndCommentSponsorBlock";
import { setMessageNotice } from "./render/MessageNotice";
import { PlayerButton } from "./render/PlayerButton";
import { checkPageForNewThumbnails, setupThumbnailListener } from "./thumbnail-utils/thumbnailManagement";
import {
    ChannelIDInfo,
    ChannelIDStatus,
    PageType,
} from "./types";
import Utils from "./utils";
import { waitFor } from "./utils/";
import { cleanPage } from "./utils/cleanup";
import { GenericUtils } from "./utils/genericUtils";
import { logDebug } from "./utils/logger";
import { getControls, getProgressBar } from "./utils/pageUtils";
import {
    detectPageType,
    getChannelIDInfo,
    getPageType,
    getVideo,
    getVideoID,
    setupVideoModule,
} from "./utils/video";

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

initVideoListeners({ updateVisibilityOfPlayerControlsButton });

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
    sponsorSubmissionNotice: getSubmissionNotice(),
    resetSponsorSubmissionNotice,
    updateEditButtonsOnPlayer: updateSegmentSubmitting,
    previewTime,
    videoInfo: contentState.videoInfo,
    getRealCurrentTime: getRealCurrentTime,
    lockedCategories: contentState.lockedCategories,
    channelIDInfo: getChannelIDInfo(),
});

initSegmentSubmission({
    skipToTime,
    startSponsorSchedule,
    previewTime,
    startSkipScheduleCheckingForStartSponsors,
    updatePreviewBar,
    selectSegment,
    seekFrameByKeyPressListener,
    playerButton,
    skipNoticeContentContainer,
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
    resetVideoListenerState();
    contentState.previewedSegment = false;

    contentState.sponsorTimes = [];
    resetSponsorSkipped();
    contentState.lastResponseStatus = 0;
    contentState.shownSegmentFailedToFetchWarning = false;

    contentState.videoInfo = null;
    contentState.channelWhitelisted = false;
    contentState.lockedCategories = [];

    //empty the preview bar
    if (getPreviewBar() !== null) {
        getPreviewBar().clear();
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

    getSkipButtonControlBar()?.disable();
    getCategoryPill()?.resetSegment();

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
    if (getPreviewBar() === null) {
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

export { seekFrameByKeyPressListener } from "./content/hotkeyHandler";

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
