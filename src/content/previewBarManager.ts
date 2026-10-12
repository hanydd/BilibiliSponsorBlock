import Config from "../config";
import PreviewBar, { PreviewBarSegment } from "../js-components/previewBar";
import { VoteResponse } from "../messageTypes";
import { ChapterVote } from "../render/ChapterVote";
import { ActionType, Category, SegmentUUID, SponsorHideType } from "../types";
import Utils from "../utils";
import { getPlayerContainer, isVisible } from "../utils/pageUtils";
import { getFormattedTime } from "../utils/formating";
import { getPlayerTimelineDuration } from "../utils/playerDuration";
import { logUiLifecycle } from "../utils/logger";
import { getVideo, getVideoID } from "../utils/video";
import { getContentApp } from "./app";
import { CONTENT_EVENTS } from "./app/events";
import { isPlayerUiReady } from "./playerUi";
import { contentState } from "./state";

const utils = new Utils();
let removeDurationWidthListener: (() => void) | null = null;

function getPreviewBarState() {
    return getContentApp().ui.getState();
}

export function getPreviewBar() { return getPreviewBarState().previewBar; }
export function getLastPreviewBarUpdate() { return getPreviewBarState().lastPreviewBarUpdate; }

export function resetPreviewBarState(): void {
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

export function registerPreviewBarManager(): void {
    const app = getContentApp();

    app.commands.register("ui/updatePreviewBar", () => updatePreviewBar());
    app.commands.register("ui/updateActiveSegment", ({ currentTime }) => updateActiveSegment(currentTime));
    app.commands.register("segments/select", ({ UUID }) => selectSegment(UUID));

    app.bus.on(CONTENT_EVENTS.PLAYER_UI_READY, () => {
        checkPreviewbarState();
        if (getPreviewBar()) updateDurationAfterSkips(); else createPreviewBar();
    });
    app.bus.on(CONTENT_EVENTS.PLAYER_UI_INVALIDATED, () => checkPreviewbarState());
    app.bus.on(CONTENT_EVENTS.PLAYER_TIMELINE_CHANGED, () => {
        updatePreviewBar();
    });
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
    const app = getContentApp();
    const { previewBar } = app.ui.getState();
    if (previewBar !== null) return;
    if (!isPlayerUiReady()) return;

    logUiLifecycle("previewBar", "wait", {
        target: "progress",
        progress: document.querySelector(".bpx-player-progress"),
        progressSchedule: document.querySelector(".bpx-player-progress-schedule"),
        shadowProgress: document.querySelector(".bpx-player-shadow-progress-area"),
    });

    const player = getPlayerContainer();
    if (!player) return;
    const parent = player.querySelector<HTMLElement>(".bpx-player-progress");
    const shadowParent = player.querySelector<HTMLElement>(".bpx-player-shadow-progress-area");

    // Overlays and the floating player's controls can cover a healthy bar.
    // Ownership and layout, rather than hit-testing, determine where to mount.
    if (parent?.isConnected && isVisible(parent)) {
        const chapterVote = new ChapterVote(voteAsync);
        const nextPreviewBar = new PreviewBar(parent, shadowParent, chapterVote);
        app.ui.patchState({ previewBar: nextPreviewBar });
        logUiLifecycle("previewBar", "attach", {
            action: "mount",
            parent,
            shadowParent,
        });
        updatePreviewBar();
    }
}

export function updatePreviewBar(): void {
    const app = getContentApp();
    const { previewBar, selectedSegment } = app.ui.getState();
    if (previewBar === null) return;
    if (getVideo() === null) return;

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

    const playerDuration = getPlayerTimelineDuration(getVideo());
    previewBar.set(
        previewBarSegments.filter((segment) => segment.actionType !== ActionType.Full),
        playerDuration
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
}

function updateDurationAfterSkips(): void {
    removeDurationAfterSkip();
    const bar = getPreviewBar();
    if (!bar || !Config.config.showTimeWithSkips || !getLastPreviewBarUpdate() || getLastPreviewBarUpdate() !== getVideoID()) return;
    const ranges = bar.segments.filter(({ actionType }) => actionType === ActionType.Skip)
        .map(({ segment }) => segment).filter(([start, end]) => end > start);
    showTimeWithoutSkips(utils.getTimestampsDuration(ranges));
}

export function checkPreviewbarState(): void {
    const app = getContentApp();
    const { previewBar } = app.ui.getState();
    if (previewBar && (!previewBar.container.isConnected ||
        !getPlayerContainer()?.contains(previewBar.container))) {
        logUiLifecycle("previewBar", "detach", {
            action: "hostRemoved",
            container: previewBar.container,
        });
        previewBar.remove();
        app.ui.patchState({ previewBar: null });
        removeDurationAfterSkip();
    }
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

    const display = document.querySelector(".bpx-player-ctrl-time-label") as HTMLDivElement;
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
