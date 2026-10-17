import Config from "../config";
import PreviewBar, { PreviewBarSegment } from "../js-components/previewBar";
import { VoteResponse } from "../messageTypes";
import { ChapterVote } from "../render/ChapterVote";
import { ActionType, Category, SegmentUUID, SponsorHideType } from "../types";
import Utils from "../utils";
import { getPlayerContainer } from "../utils/pageUtils";
import { getPlayerSurface, observePlayerSurfaces } from "../player/PlayerSurface";
import { getFormattedTime } from "../utils/formating";
import { getPlayerTimelineDuration } from "../utils/playerDuration";
import { logUiLifecycle } from "../utils/logger";
import { addCleanupListener } from "../utils/cleanup";
import { getVideo, getVideoID } from "../utils/video";
import { getContentApp } from "./app";
import { CONTENT_EVENTS } from "./app/events";
import { contentState } from "./state";

const utils = new Utils();
let removeDurationWidthListener: (() => void) | null = null;
let durationObserver: MutationObserver | null = null;
let durationHost: Element | null = null;
let stopObservingTimelines: (() => void) | null = null;

function getPreviewBarState() {
    return getContentApp().ui.getState();
}

export function getPreviewBar() { return getPreviewBarState().previewBar; }
export function getLastPreviewBarUpdate() { return getPreviewBarState().lastPreviewBarUpdate; }

export function resetPreviewBarState(): void {
    durationObserver?.disconnect();
    durationObserver = null;
    durationHost = null;
    stopObservingTimelines?.();
    stopObservingTimelines = null;
    removeDurationAfterSkip();
    const { previewBar } = getPreviewBarState();
    if (previewBar) {
        previewBar.remove();
    }
    getContentApp().ui.patchState({
        previewBar: null,
        selectedSegment: null,
        lastPreviewBarUpdate: null,
    });
}

export const durationID = "sponsorBlockDurationAfterSkips";

function voteAsync(type: number, UUID: SegmentUUID, category?: Category): Promise<VoteResponse | undefined> {
    return Promise.resolve(getContentApp().commands.execute("segment/voteAsync", { type, UUID, category }));
}

function observeTimelines(): void {
    if (stopObservingTimelines) return;
    stopObservingTimelines = observePlayerSurfaces(surface => surface.timeline.observe(checkPreviewbarState));
}

export function registerPreviewBarManager(): void {
    const app = getContentApp();
    addCleanupListener(resetPreviewBarState);
    observeTimelines();

    app.commands.register("ui/updatePreviewBar", () => updatePreviewBar());
    app.commands.register("ui/updateActiveSegment", ({ currentTime }) => updateActiveSegment(currentTime));
    app.commands.register("segments/select", ({ UUID }) => selectSegment(UUID));

    app.bus.on(CONTENT_EVENTS.PLAYER_UI_READY, () => {
        checkPreviewbarState();
        observeDurationHost();
        updateDurationAfterSkips();
    });
    app.bus.on(CONTENT_EVENTS.PLAYER_UI_INVALIDATED, () => checkPreviewbarState());
    app.bus.on(CONTENT_EVENTS.PLAYER_TIMELINE_CHANGED, () => {
        checkPreviewbarState();
    });
    app.bus.on(CONTENT_EVENTS.VIDEO_ELEMENT_CHANGED, () => checkPreviewbarState());
    app.bus.on(CONTENT_EVENTS.SEGMENTS_LOADED, ({ videoID }) => {
        if (videoID !== getVideoID()) {
            return;
        }

        updatePreviewBar();
    });
    app.bus.on(CONTENT_EVENTS.SEGMENTS_SUBMITTING_CHANGED, ({ videoID }) => {
        if (videoID !== getVideoID()) {
            return;
        }

        updatePreviewBar();
    });
    app.bus.on(CONTENT_EVENTS.SEGMENT_UPDATED, ({ videoID }) => {
        if (videoID !== getVideoID()) {
            return;
        }

        updatePreviewBar();
    });
}

export function createPreviewBar(): void {
    observeTimelines();
    const app = getContentApp();
    const { previewBar } = app.ui.getState();
    if (previewBar !== null) return;
    if (!getVideo()) return;
    app.ui.patchState({ previewBar: new PreviewBar(new ChapterVote(voteAsync)) });
    updatePreviewBar();
}

export function updatePreviewBar(): void {
    const app = getContentApp();
    const { previewBar, selectedSegment } = app.ui.getState();
    if (previewBar === null) { createPreviewBar(); return; }
    const video = getVideo();
    if (!video) { previewBar.syncTargets([]); return; }

    const previewBarSegments: PreviewBarSegment[] = [];
    if (contentState.sponsorTimes) {
        contentState.sponsorTimes.forEach((segment) => {
            if (segment.hidden !== SponsorHideType.Visible) return;

            previewBarSegments.push({
                segment: segment.segment as [number, number],
                category: segment.category,
                actionType: segment.actionType,
                unsubmitted: false,
                showLarger: segment.actionType === ActionType.Poi,
                source: segment.source,
                selectedSegment: selectedSegment && segment.UUID === selectedSegment,
            });
        });
    }

    contentState.sponsorTimesSubmitting.forEach((segment) => {
        previewBarSegments.push({
            segment: segment.segment as [number, number],
            category: segment.category,
            actionType: segment.actionType,
            unsubmitted: true,
            showLarger: segment.actionType === ActionType.Poi,
            source: segment.source,
        });
    });

    const snapshot = getPlayerSurface(video).timeline.read(video);
    previewBar.syncTargets(snapshot.targets);
    previewBar.set(
        previewBarSegments.filter((segment) => segment.actionType !== ActionType.Full),
        snapshot.duration
    );
    logUiLifecycle("previewBar", "state", {
        action: "update",
        segmentCount: previewBarSegments.length,
        selectedSegment,
        video: getVideo(),
    });
    if (getVideo()) updateActiveSegment(getVideo().currentTime);

    app.ui.patchState({ lastPreviewBarUpdate: getVideoID() });
    updateDurationAfterSkips();
    observeDurationHost();
}

function updateDurationAfterSkips(): void {
    removeDurationAfterSkip();
    const bar = getPreviewBar();
    if (!bar || !Config.config.showTimeWithSkips || !getLastPreviewBarUpdate() || getLastPreviewBarUpdate() !== getVideoID()) return;
    const ranges = bar.segments.filter(({ actionType }) => actionType === ActionType.Skip)
        .map(({ segment }) => segment).filter(([start, end]) => end > start);
    showTimeWithoutSkips(utils.getTimestampsDuration(ranges));
}

function observeDurationHost(): void {
    const host = getPlayerContainer()?.querySelector(".bpx-player-ctrl-time");
    if (host === durationHost) return;
    durationObserver?.disconnect();
    durationHost = host;
    if (!host) return;
    durationObserver = new MutationObserver(() => {
        // Native label rewrites do not change the ready host or timeline. Restore
        // only a missing caption; our own rendering leaves it present and stops here.
        const label = host.querySelector(".bpx-player-ctrl-time-label");
        if (label && !label.querySelector(`#${durationID}`) && getLastPreviewBarUpdate() &&
            getLastPreviewBarUpdate() === getVideoID() && Config.config.showTimeWithSkips) {
            updateDurationAfterSkips();
        }
    });
    durationObserver.observe(host, { childList: true, subtree: true });
}

export function checkPreviewbarState(): void {
    const bar = getPreviewBar(), video = getVideo();
    if (!bar) { createPreviewBar(); return; }
    if (!video) { bar.syncTargets([]); return; }
    const snapshot = getPlayerSurface(video).timeline.read(video);
    bar.syncTargets(snapshot.targets);
    if (bar.videoDuration !== snapshot.duration) updatePreviewBar();
    observeDurationHost();
}

export function selectSegment(UUID: SegmentUUID): void {
    getContentApp().ui.patchState({ selectedSegment: UUID });
    updatePreviewBar();
}

export function updateActiveSegment(currentTime: number): void {
    const { previewBar } = getContentApp().ui.getState();
    previewBar?.updateChapterText(contentState.sponsorTimes, contentState.sponsorTimesSubmitting, currentTime);

    chrome.runtime.sendMessage({
        message: "time",
        time: currentTime,
    });
    getContentApp().bus.emit(CONTENT_EVENTS.PLAYER_TIME_UPDATED, { time: currentTime }, { source: "previewBarManager" });
}

export function showTimeWithoutSkips(skippedDuration: number): void {
    if (isNaN(skippedDuration) || skippedDuration < 0) {
        skippedDuration = 0;
    }

    const display = getPlayerContainer()?.querySelector(".bpx-player-ctrl-time-label") as HTMLDivElement;
    if (!display) return;

    let duration = document.getElementById(durationID);

    if (duration === null) {
        duration = document.createElement("span");
        duration.id = durationID;
        display.appendChild(duration);
    }

    const durationAfterSkips = getFormattedTime(getPlayerTimelineDuration(getVideo()) - skippedDuration);

    const refreshDurationTextWidth = () => {
        display.style.width = "auto";
        display.parentElement.style.minWidth = `${display.clientWidth - 11}px`;
    };

    if (durationAfterSkips != null && skippedDuration > 0) {
        duration.innerText = " (" + durationAfterSkips + ")";

        refreshDurationTextWidth();
        window.addEventListener("fullscreenchange", refreshDurationTextWidth);
        removeDurationWidthListener = () => window.removeEventListener("fullscreenchange", refreshDurationTextWidth);
    }
}

export function removeDurationAfterSkip(): void {
    removeDurationWidthListener?.();
    removeDurationWidthListener = null;
    const duration = document.getElementById(durationID);
    duration?.remove();
}
