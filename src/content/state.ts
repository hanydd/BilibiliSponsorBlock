import advanceSkipNotice from "../render/advanceSkipNotice";
import SkipNotice from "../render/SkipNotice";
import {
    Category,
    PortVideo,
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
let previewedSegment = false;

let portVideo: PortVideo = null;

let videoInfo: VideoInfo = null;
let lockedCategories: Category[] = [];

let switchingVideos = null;
let channelWhitelisted = false;

let sponsorTimesSubmitting: SponsorTime[] = [];

let lastResponseStatus: number;

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

    get previewedSegment() { return previewedSegment; },
    set previewedSegment(v: boolean) { previewedSegment = v; },

    get portVideo() { return portVideo; },
    set portVideo(v: PortVideo) { portVideo = v; },

    get videoInfo() { return videoInfo; },
    set videoInfo(v: VideoInfo) { videoInfo = v; },

    get lockedCategories() { return lockedCategories; },
    set lockedCategories(v: Category[]) { lockedCategories = v; },

    get switchingVideos() { return switchingVideos; },
    set switchingVideos(v) { switchingVideos = v; },

    get channelWhitelisted() { return channelWhitelisted; },
    set channelWhitelisted(v: boolean) { channelWhitelisted = v; },

    get sponsorTimesSubmitting() { return sponsorTimesSubmitting; },
    set sponsorTimesSubmitting(v: SponsorTime[]) { sponsorTimesSubmitting = v; },

    get lastResponseStatus() { return lastResponseStatus; },
    set lastResponseStatus(v: number) { lastResponseStatus = v; },

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
