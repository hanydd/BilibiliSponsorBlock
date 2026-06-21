import advanceSkipNotice from "../render/advanceSkipNotice";
import SkipNotice from "../render/SkipNotice";
import {
    Category,
    PageType,
    PortVideo,
    SponsorTime,
    ToggleSkippable,
    VideoInfo,
} from "../types";
import { sourceId } from "../utils/injectedScriptMessageUtils";
import { logDebug, logUiLifecycle } from "../utils/logger";
import { getContentApp } from "./app";
import { CONTENT_EVENTS } from "./app/events";
import { ContentAppState } from "./app/types";

export const skipBuffer = 0.003;
export const endTimeSkipBuffer = 0.5;
export const manualSkipPercentCount = 0.5;

let sponsorDataFound = false;
let sponsorTimes: SponsorTime[] = [];
const skipNotices: SkipNotice[] = [];
let advanceSkipNoticesVar: advanceSkipNotice | null = null;
let activeSkipKeybindElement: ToggleSkippable = null;
let shownSegmentFailedToFetchWarning = false;
let previewedSegment = false;

let portVideo: PortVideo = null;

let videoInfo: VideoInfo = null;
let lockedCategories: Category[] = [];

let switchingVideos = null;
let channelWhitelisted = false;

let sponsorTimesSubmitting: SponsorTime[] = [];

let lastResponseStatus: number;

let pageLoaded = false;
let pageType = PageType.Unknown;
let pageUrl = "";

function buildContentStateSnapshot(): ContentAppState {
    return {
        sponsorDataFound,
        sponsorTimes,
        skipNotices,
        advanceSkipNotices: advanceSkipNoticesVar,
        activeSkipKeybindElement,
        shownSegmentFailedToFetchWarning,
        previewedSegment,
        portVideo,
        videoInfo,
        lockedCategories,
        switchingVideos,
        channelWhitelisted,
        sponsorTimesSubmitting,
        lastResponseStatus: lastResponseStatus ?? 0,
        pageLoaded,
        pageType,
        pageUrl,
    };
}

export function syncContentStateStore(source = "content/state"): void {
    try {
        getContentApp().store.replaceState(buildContentStateSnapshot(), source);
    } catch (error) {
        // The app is not ready during early module evaluation.
    }
}

/**
 * Shared mutable state for content script modules.
 *
 * Instead of scattering module-level variables across content.ts,
 * all state lives here so that extracted modules can import and
 * share it without circular dependency issues.
 */
export const contentState = {
    get sponsorDataFound() { return sponsorDataFound; },
    set sponsorDataFound(v: boolean) {
        sponsorDataFound = v;
        syncContentStateStore("contentState.sponsorDataFound");
    },

    get sponsorTimes() { return sponsorTimes; },
    set sponsorTimes(v: SponsorTime[]) {
        sponsorTimes = v;
        syncContentStateStore("contentState.sponsorTimes");
    },

    get skipNotices() { return skipNotices; },

    get advanceSkipNotices() { return advanceSkipNoticesVar; },
    set advanceSkipNotices(v: advanceSkipNotice | null) {
        advanceSkipNoticesVar = v;
        syncContentStateStore("contentState.advanceSkipNotices");
    },

    get activeSkipKeybindElement() { return activeSkipKeybindElement; },
    set activeSkipKeybindElement(v: ToggleSkippable) {
        activeSkipKeybindElement = v;
        syncContentStateStore("contentState.activeSkipKeybindElement");
    },

    get shownSegmentFailedToFetchWarning() { return shownSegmentFailedToFetchWarning; },
    set shownSegmentFailedToFetchWarning(v: boolean) {
        shownSegmentFailedToFetchWarning = v;
        syncContentStateStore("contentState.shownSegmentFailedToFetchWarning");
    },

    get previewedSegment() { return previewedSegment; },
    set previewedSegment(v: boolean) {
        previewedSegment = v;
        syncContentStateStore("contentState.previewedSegment");
    },

    get portVideo() { return portVideo; },
    set portVideo(v: PortVideo) {
        portVideo = v;
        syncContentStateStore("contentState.portVideo");
    },

    get videoInfo() { return videoInfo; },
    set videoInfo(v: VideoInfo) {
        videoInfo = v;
        syncContentStateStore("contentState.videoInfo");
    },

    get lockedCategories() { return lockedCategories; },
    set lockedCategories(v: Category[]) {
        lockedCategories = v;
        syncContentStateStore("contentState.lockedCategories");
    },

    get switchingVideos() { return switchingVideos; },
    set switchingVideos(v) {
        switchingVideos = v;
        syncContentStateStore("contentState.switchingVideos");
    },

    get channelWhitelisted() { return channelWhitelisted; },
    set channelWhitelisted(v: boolean) {
        channelWhitelisted = v;
        syncContentStateStore("contentState.channelWhitelisted");
    },

    get sponsorTimesSubmitting() { return sponsorTimesSubmitting; },
    set sponsorTimesSubmitting(v: SponsorTime[]) {
        sponsorTimesSubmitting = v;
        syncContentStateStore("contentState.sponsorTimesSubmitting");
    },

    get lastResponseStatus() { return lastResponseStatus; },
    set lastResponseStatus(v: number) {
        lastResponseStatus = v;
        syncContentStateStore("contentState.lastResponseStatus");
    },

    get pageLoaded() { return pageLoaded; },
    set pageLoaded(v: boolean) {
        pageLoaded = v;
        syncContentStateStore("contentState.pageLoaded");
    },

    get pageType() { return pageType; },
    set pageType(v: PageType) {
        pageType = v;
        syncContentStateStore("contentState.pageType");
    },

    get pageUrl() { return pageUrl; },
    set pageUrl(v: string) {
        pageUrl = v;
        syncContentStateStore("contentState.pageUrl");
    },
};

/**
 * Wait for the page to be truly available (Vue mount / hydration completed)
 * before allowing the plugin to operate on the DOM.
 *
 * Primary: Listen for "pageReady" messages from MAIN world.
 * Fallback: If no message is received within 30 s, use readyState=complete + 2 s delay.
 */
export function setupPageLoadingListener(): void {
    const TAG = "[BSB-pageReady]";
    const t0 = performance.now();

    let resolved = false;
    const markReady = (reason: string) => {
        if (resolved) return;
        resolved = true;
        const elapsed = Math.round(performance.now() - t0);
        logDebug(`${TAG} Page ready (${reason}) at +${elapsed}ms`);
        logUiLifecycle("pageReady", "ready", {
            action: "resolved",
            reason,
            elapsed,
        });
        contentState.pageLoaded = true;
        try {
            getContentApp().bus.emit(CONTENT_EVENTS.APP_PAGE_READY, { pageLoaded: true }, { source: "content/state" });
        } catch (error) {
            // The app may not have finished bootstrapping yet.
        }
    };

    window.addEventListener("message", (e: MessageEvent) => {
        if (e.data?.source === sourceId && e.data?.type === "pageReady") {
            const mainWorldDetails = e.data?.details && typeof e.data.details === "object"
                ? e.data.details as Record<string, unknown>
                : {};
            const forwardedStage = typeof mainWorldDetails.stage === "string"
                ? mainWorldDetails.stage
                : "main/pageReadyDetected";
            const resolveReason = forwardedStage === "main/pageReadyTimeout"
                ? "MAIN world pageReady timeout"
                : "vue-mount signal from MAIN world";

            logUiLifecycle("pageReady", "state", {
                action: "mainWorldSignal",
                stage: forwardedStage,
                ...mainWorldDetails,
            });
            logUiLifecycle("pageReady", "state", {
                action: "messageReceived",
                source: e.data?.source,
                messageType: e.data?.type,
                mainWorldStage: forwardedStage,
            });
            markReady(resolveReason);
        }
    });

    const FALLBACK_TIMEOUT = 30000;
    setTimeout(() => {
        if (!resolved) {
            if (document.readyState === "complete") {
                markReady(`fallback: readyState already complete after ${FALLBACK_TIMEOUT}ms`);
            } else {
                window.addEventListener("load", () => {
                    setTimeout(() => markReady("fallback: window.load + 2s delay"), 2000);
                }, { once: true });
            }
        }
    }, FALLBACK_TIMEOUT);
}

export function getPageLoaded(): boolean {
    return contentState.pageLoaded;
}
