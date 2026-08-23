import Config from "../config";
import PreviewBar, { PreviewBarSegment } from "../js-components/previewBar";
import { VoteResponse } from "../messageTypes";
import { ChapterVote } from "../render/ChapterVote";
import { ActionType, BVID, Category, SegmentUUID, SponsorHideType } from "../types";
import Utils from "../utils";
import { findValidElement } from "../utils/dom";
import { getFormattedTime } from "../utils/formating";
import { logUiLifecycle } from "../utils/logger";
import { getVideo, getVideoID } from "../utils/video";
import { getContentApp } from "./app";
import { CONTENT_EVENTS } from "./app/events";
import { isPlayerUiReady, waitForPlayerUiReady } from "./playerUi";
import { contentState } from "./state";

const utils = new Utils();

function getPreviewBarState() {
    return getContentApp().ui.getState();
}

export function getPreviewBar() { return getPreviewBarState().previewBar; }
export function getLastPreviewBarUpdate() { return getPreviewBarState().lastPreviewBarUpdate; }

export function resetPreviewBarState(): void {
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

    app.commands.register("ui/createPreviewBar", () => createPreviewBar());
    app.commands.register("ui/updatePreviewBar", () => updatePreviewBar());
    app.commands.register("ui/checkPreviewBarState", () => checkPreviewbarState());
    app.commands.register("ui/updateActiveSegment", ({ currentTime }) => updateActiveSegment(currentTime));
    app.commands.register("segments/select", ({ UUID }) => selectSegment(UUID));

    app.bus.on(CONTENT_EVENTS.PLAYER_VIDEO_READY, () => {
        createPreviewBar();
        updatePreviewBar();
        void app.commands.execute("ui/updatePlayerButtons", undefined);
    });
    app.bus.on(CONTENT_EVENTS.PLAYER_DURATION_CHANGED, () => {
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
    if (!isPlayerUiReady()) {
        void waitForPlayerUiReady().then(() => createPreviewBar()).catch(() => undefined);
        return;
    }

    logUiLifecycle("previewBar", "wait", {
        target: "progress",
        progress: document.querySelector(".bpx-player-progress"),
        progressSchedule: document.querySelector(".bpx-player-progress-schedule"),
        shadowProgress: document.querySelector(".bpx-player-shadow-progress-area"),
    });

    const progressElementOptions = [
        {
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
            const nextPreviewBar = new PreviewBar(parent, shadowParent, chapterVote);
            app.ui.patchState({ previewBar: nextPreviewBar });
            logUiLifecycle("previewBar", "attach", {
                action: "mount",
                parent,
                shadowParent,
            });
            updatePreviewBar();
            break;
        }
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

    previewBar.set(
        previewBarSegments.filter((segment) => segment.actionType !== ActionType.Full),
        getVideo()?.duration
    );
    logUiLifecycle("previewBar", "state", {
        action: "update",
        segmentCount: previewBarSegments.length,
        selectedSegment,
        video: getVideo(),
    });
    if (getVideo()) updateActiveSegment(getVideo().currentTime);

    void app.commands.execute("ui/updatePlayerButtons", undefined);

    removeDurationAfterSkip();
    if (Config.config.showTimeWithSkips) {
        const skippedDuration = utils.getTimestampsDuration(
            previewBarSegments.filter(({ actionType }) => actionType !== ActionType.Mute).map(({ segment }) => segment)
        );

        showTimeWithoutSkips(skippedDuration);
    }

    app.ui.patchState({ lastPreviewBarUpdate: getVideoID() as BVID });
}

export function checkPreviewbarState(): void {
    const app = getContentApp();
    const { previewBar } = app.ui.getState();
    if (previewBar && !utils.findReferenceNode()?.contains(previewBar.container)) {
        logUiLifecycle("previewBar", "detach", {
            action: "hostRemoved",
            container: previewBar.container,
        });
        previewBar.remove();
        app.ui.patchState({ previewBar: null });
        removeDurationAfterSkip();
    }

    void waitForPlayerUiReady().then(() => createPreviewBar()).catch(() => undefined);
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

    const durationAfterSkips = getFormattedTime(getVideo()?.duration - skippedDuration);

    const refreshDurationTextWidth = () => {
        display.style.width = "auto";
        display.parentElement.style.minWidth = `${display.clientWidth - 11}px`;
    };

    if (durationAfterSkips != null && skippedDuration > 0) {
        duration.innerText = " (" + durationAfterSkips + ")";

        refreshDurationTextWidth();
        window.addEventListener("fullscreenchange", refreshDurationTextWidth);
    }
}

export function removeDurationAfterSkip(): void {
    const duration = document.getElementById(durationID);
    duration?.remove();
}
