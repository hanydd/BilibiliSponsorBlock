import PreviewBar from "../js-components/previewBar";
import { SkipButtonControlBar } from "../js-components/skipButtonControlBar";
import advanceSkipNotice from "../render/advanceSkipNotice";
import { CategoryPill } from "../render/CategoryPill";
import { DescriptionPortPill } from "../render/DescriptionPortPill";
import SkipNotice from "../render/SkipNotice";
import SubmissionNotice from "../render/SubmissionNotice";
import {
    BVID,
    Category,
    PortVideo,
    SegmentUUID,
    SponsorTime,
    ToggleSkippable,
    VideoInfo,
} from "../types";
import { sourceId } from "../utils/injectedScriptMessageUtils";

export const skipBuffer = 0.003;
export const endTimeSkipBuffer = 0.5;
export const manualSkipPercentCount = 0.5;

let sponsorDataFound = false;
let sponsorTimes: SponsorTime[] = [];
const skipNotices: SkipNotice[] = [];
let advanceSkipNoticesVar: advanceSkipNotice | null = null;
let activeSkipKeybindElement: ToggleSkippable = null;
let shownSegmentFailedToFetchWarning = false;
let selectedSegment: SegmentUUID | null = null;
let previewedSegment = false;

let portVideo: PortVideo = null;

let videoInfo: VideoInfo = null;
let lockedCategories: Category[] = [];
const lastKnownVideoTime: { videoTime: number; preciseTime: number; fromPause: boolean; approximateDelay: number } = {
    videoTime: null,
    preciseTime: null,
    fromPause: false,
    approximateDelay: null,
};
let lastTimeFromWaitingEvent: number = null;

let currentSkipSchedule: NodeJS.Timeout = null;
let currentSkipInterval: NodeJS.Timeout = null;
let currentVirtualTimeInterval: NodeJS.Timeout = null;
let currentadvanceSkipSchedule: NodeJS.Timeout = null;

let sponsorSkipped: boolean[] = [];

let videoMuted = false;

let lastPreviewBarUpdate: BVID;
let switchingVideos = null;
let lastCheckTime = 0;
let lastCheckVideoTime = -1;
let channelWhitelisted = false;

let previewBar: PreviewBar = null;
let skipButtonControlBar: SkipButtonControlBar = null;
let categoryPill: CategoryPill = null;
let descriptionPill: DescriptionPortPill = null;
let playerButtons: Record<string, { button: HTMLButtonElement; image: HTMLImageElement }> = {};

let sponsorTimesSubmitting: SponsorTime[] = [];
let loadedPreloadedSegment = false;

let popupInitialised = false;

let submissionNotice: SubmissionNotice = null;
let lastResponseStatus: number;
let lookupWaiting = false;

let pageLoaded = false;

/**
 * Shared mutable state for content script modules.
 *
 * Instead of scattering module-level variables across content.ts,
 * all state lives here so that extracted modules can import and
 * share it without circular dependency issues.
 */
export const contentState = {
    get sponsorDataFound() { return sponsorDataFound; },
    set sponsorDataFound(v: boolean) { sponsorDataFound = v; },

    get sponsorTimes() { return sponsorTimes; },
    set sponsorTimes(v: SponsorTime[]) { sponsorTimes = v; },

    get skipNotices() { return skipNotices; },

    get advanceSkipNotices() { return advanceSkipNoticesVar; },
    set advanceSkipNotices(v: advanceSkipNotice | null) { advanceSkipNoticesVar = v; },

    get activeSkipKeybindElement() { return activeSkipKeybindElement; },
    set activeSkipKeybindElement(v: ToggleSkippable) { activeSkipKeybindElement = v; },

    get shownSegmentFailedToFetchWarning() { return shownSegmentFailedToFetchWarning; },
    set shownSegmentFailedToFetchWarning(v: boolean) { shownSegmentFailedToFetchWarning = v; },

    get selectedSegment() { return selectedSegment; },
    set selectedSegment(v: SegmentUUID | null) { selectedSegment = v; },

    get previewedSegment() { return previewedSegment; },
    set previewedSegment(v: boolean) { previewedSegment = v; },

    get portVideo() { return portVideo; },
    set portVideo(v: PortVideo) { portVideo = v; },

    get videoInfo() { return videoInfo; },
    set videoInfo(v: VideoInfo) { videoInfo = v; },

    get lockedCategories() { return lockedCategories; },
    set lockedCategories(v: Category[]) { lockedCategories = v; },

    get lastKnownVideoTime() { return lastKnownVideoTime; },

    get lastTimeFromWaitingEvent() { return lastTimeFromWaitingEvent; },
    set lastTimeFromWaitingEvent(v: number) { lastTimeFromWaitingEvent = v; },

    get currentSkipSchedule() { return currentSkipSchedule; },
    set currentSkipSchedule(v: NodeJS.Timeout) { currentSkipSchedule = v; },

    get currentSkipInterval() { return currentSkipInterval; },
    set currentSkipInterval(v: NodeJS.Timeout) { currentSkipInterval = v; },

    get currentVirtualTimeInterval() { return currentVirtualTimeInterval; },
    set currentVirtualTimeInterval(v: NodeJS.Timeout) { currentVirtualTimeInterval = v; },

    get currentadvanceSkipSchedule() { return currentadvanceSkipSchedule; },
    set currentadvanceSkipSchedule(v: NodeJS.Timeout) { currentadvanceSkipSchedule = v; },

    get sponsorSkipped() { return sponsorSkipped; },
    set sponsorSkipped(v: boolean[]) { sponsorSkipped = v; },

    get videoMuted() { return videoMuted; },
    set videoMuted(v: boolean) { videoMuted = v; },

    get lastPreviewBarUpdate() { return lastPreviewBarUpdate; },
    set lastPreviewBarUpdate(v: BVID) { lastPreviewBarUpdate = v; },

    get switchingVideos() { return switchingVideos; },
    set switchingVideos(v) { switchingVideos = v; },

    get lastCheckTime() { return lastCheckTime; },
    set lastCheckTime(v: number) { lastCheckTime = v; },

    get lastCheckVideoTime() { return lastCheckVideoTime; },
    set lastCheckVideoTime(v: number) { lastCheckVideoTime = v; },

    get channelWhitelisted() { return channelWhitelisted; },
    set channelWhitelisted(v: boolean) { channelWhitelisted = v; },

    get previewBar() { return previewBar; },
    set previewBar(v: PreviewBar) { previewBar = v; },

    get skipButtonControlBar() { return skipButtonControlBar; },
    set skipButtonControlBar(v: SkipButtonControlBar) { skipButtonControlBar = v; },

    get categoryPill() { return categoryPill; },
    set categoryPill(v: CategoryPill) { categoryPill = v; },

    get descriptionPill() { return descriptionPill; },
    set descriptionPill(v: DescriptionPortPill) { descriptionPill = v; },

    get playerButtons() { return playerButtons; },
    set playerButtons(v: Record<string, { button: HTMLButtonElement; image: HTMLImageElement }>) { playerButtons = v; },

    get sponsorTimesSubmitting() { return sponsorTimesSubmitting; },
    set sponsorTimesSubmitting(v: SponsorTime[]) { sponsorTimesSubmitting = v; },

    get loadedPreloadedSegment() { return loadedPreloadedSegment; },
    set loadedPreloadedSegment(v: boolean) { loadedPreloadedSegment = v; },

    get popupInitialised() { return popupInitialised; },
    set popupInitialised(v: boolean) { popupInitialised = v; },

    get submissionNotice() { return submissionNotice; },
    set submissionNotice(v: SubmissionNotice) { submissionNotice = v; },

    get lastResponseStatus() { return lastResponseStatus; },
    set lastResponseStatus(v: number) { lastResponseStatus = v; },

    get lookupWaiting() { return lookupWaiting; },
    set lookupWaiting(v: boolean) { lookupWaiting = v; },

    get pageLoaded() { return pageLoaded; },
    set pageLoaded(v: boolean) { pageLoaded = v; },
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
        console.debug(`${TAG} Page ready (${reason}) at +${elapsed}ms`);
        contentState.pageLoaded = true;
    };

    window.addEventListener("message", (e: MessageEvent) => {
        if (e.data?.source === sourceId && e.data?.type === "pageReady") {
            markReady("vue-mount signal from MAIN world");
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
