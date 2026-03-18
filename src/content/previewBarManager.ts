import Config from "../config";
import PreviewBar, { PreviewBarSegment } from "../js-components/previewBar";
import { VoteResponse } from "../messageTypes";
import { ChapterVote } from "../render/ChapterVote";
import { ActionType, BVID, Category, SegmentUUID, SponsorHideType } from "../types";
import Utils from "../utils";
import { waitFor } from "../utils/";
import { findValidElement } from "../utils/dom";
import { getFormattedTime } from "../utils/formating";
import { getHashParams } from "../utils/pageUtils";
import { getVideo, getVideoID } from "../utils/video";
import { contentState } from "./state";

const utils = new Utils();

// --- Module-private state (formerly on contentState) ---
let previewBar: PreviewBar = null;
let selectedSegment: SegmentUUID | null = null;
let lastPreviewBarUpdate: BVID;

export function getPreviewBar() { return previewBar; }
export function getLastPreviewBarUpdate() { return lastPreviewBarUpdate; }

export function resetPreviewBarState(): void {
    if (previewBar) {
        previewBar.remove();
        previewBar = null;
    }
    selectedSegment = null;
}

let _voteAsync: (type: number, UUID: SegmentUUID, category?: Category) => Promise<VoteResponse | undefined>;
let _updateVisibilityOfPlayerControlsButton: () => Promise<void>;

export function initPreviewBarManager(deps: {
    voteAsync: (type: number, UUID: SegmentUUID, category?: Category) => Promise<VoteResponse | undefined>;
    updateVisibilityOfPlayerControlsButton: () => Promise<void>;
}): void {
    _voteAsync = deps.voteAsync;
    _updateVisibilityOfPlayerControlsButton = deps.updateVisibilityOfPlayerControlsButton;
}

export const durationID = "sponsorBlockDurationAfterSkips";

export function createPreviewBar(): void {
    if (previewBar !== null) return;

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
            const chapterVote = new ChapterVote(_voteAsync);
            previewBar = new PreviewBar(parent, shadowParent, chapterVote);
            updatePreviewBar();
            break;
        }
    }
}

export function updatePreviewBar(): void {
    if (previewBar === null) return;
    if (getVideo() === null) return;

    const hashParams = getHashParams();
    const requiredSegment = (hashParams?.requiredSegment as SegmentUUID) || undefined;
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
                requiredSegment:
                    requiredSegment && (segment.UUID === requiredSegment || segment.UUID?.startsWith(requiredSegment)),
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
    if (getVideo()) updateActiveSegment(getVideo().currentTime);

    _updateVisibilityOfPlayerControlsButton();

    removeDurationAfterSkip();
    if (Config.config.showTimeWithSkips) {
        const skippedDuration = utils.getTimestampsDuration(
            previewBarSegments.filter(({ actionType }) => actionType !== ActionType.Mute).map(({ segment }) => segment)
        );

        showTimeWithoutSkips(skippedDuration);
    }

    lastPreviewBarUpdate = getVideoID();
}

export function checkPreviewbarState(): void {
    if (previewBar && !utils.findReferenceNode()?.contains(previewBar.container)) {
        previewBar.remove();
        previewBar = null;
        removeDurationAfterSkip();
    }

    waitFor(() => !document.hidden, 24 * 60 * 60, 500).then(createPreviewBar);
}

export function selectSegment(UUID: SegmentUUID): void {
    selectedSegment = UUID;
    updatePreviewBar();
}

export function updateActiveSegment(currentTime: number): void {
    previewBar?.updateChapterText(contentState.sponsorTimes, contentState.sponsorTimesSubmitting, currentTime);

    chrome.runtime.sendMessage({
        message: "time",
        time: currentTime,
    });
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
