import Config from "../config";
import SkipNotice from "../render/SkipNotice";
import advanceSkipNotice from "../render/advanceSkipNotice";
import { SponsorTime } from "../types";
import { waitFor } from "../utils/";
import { getContentApp } from "./app";
import { CONTENT_EVENTS } from "./app/events";
import { contentState } from "./state";
import { getSkipNoticeContentContainer } from "./skipNoticeContentContainer";

function getSkipButtonControlBar() {
    return getContentApp().ui.getState().skipButtonControlBar;
}

function removeSkipNotice(notice: SkipNotice): void {
    const noticeIndex = contentState.skipNotices.indexOf(notice);
    if (noticeIndex >= 0) {
        contentState.skipNotices.splice(noticeIndex, 1);
    }

    if (contentState.activeSkipKeybindElement === notice) {
        contentState.activeSkipKeybindElement = null;
    }
}

function clearAdvanceSkipNotice(notice: advanceSkipNotice): void {
    if (contentState.advanceSkipNotices === notice) {
        contentState.advanceSkipNotices = null;
    }

    if (contentState.activeSkipKeybindElement === notice) {
        contentState.activeSkipKeybindElement = null;
    }
}

function closeAdvanceSkipNotice(): void {
    contentState.advanceSkipNotices?.close();
}

function closeSkipNotices(includeAdvance = false): void {
    while (contentState.skipNotices.length > 0) {
        contentState.skipNotices[contentState.skipNotices.length - 1].close();
    }

    if (includeAdvance) {
        closeAdvanceSkipNotice();
    }
}

function dontShowNoticeAgain(): void {
    Config.config.dontShowNotice = true;
    closeSkipNotices(true);
}

function createSkipNotice(
    skippingSegments: SponsorTime[],
    autoSkip: boolean,
    unskipTime: number | null | undefined,
    startReskip: boolean
): void {
    for (const skipNotice of contentState.skipNotices) {
        if (
            skippingSegments.length === skipNotice.segments.length &&
            skippingSegments.every((segment) => skipNotice.segments.some((existingSegment) => existingSegment.UUID === segment.UUID))
        ) {
            return;
        }
    }

    const advanceSkipNoticeShow = !!contentState.advanceSkipNotices;
    const newSkipNotice = new SkipNotice(
        skippingSegments,
        autoSkip,
        getSkipNoticeContentContainer,
        () => {
            closeAdvanceSkipNotice();
        },
        unskipTime ?? null,
        startReskip,
        advanceSkipNoticeShow,
        removeSkipNotice
    );
    if (Config.config.skipKeybind == null) newSkipNotice.setShowKeybindHint(false);
    contentState.skipNotices.push(newSkipNotice);

    contentState.activeSkipKeybindElement?.setShowKeybindHint(false);
    contentState.activeSkipKeybindElement = newSkipNotice;
}

function createAdvanceSkipNotice(
    skippingSegments: SponsorTime[],
    unskipTime: number | null | undefined,
    autoSkip: boolean,
    startReskip: boolean
): void {
    if (contentState.advanceSkipNotices && !contentState.advanceSkipNotices.closed && contentState.advanceSkipNotices.sameNotice(skippingSegments)) {
        return;
    }

    closeAdvanceSkipNotice();
    contentState.advanceSkipNotices = new advanceSkipNotice(
        skippingSegments,
        getSkipNoticeContentContainer,
        unskipTime ?? null,
        autoSkip,
        startReskip,
        clearAdvanceSkipNotice
    );
    if (Config.config.skipKeybind == null) contentState.advanceSkipNotices.setShowKeybindHint(false);

    contentState.activeSkipKeybindElement?.setShowKeybindHint(false);
    contentState.activeSkipKeybindElement = contentState.advanceSkipNotices;
}

function applySkipButtonState(enabled: boolean, segment: SponsorTime | null): void {
    if (!enabled || !segment) {
        const skipButtonControlBar = getSkipButtonControlBar();
        skipButtonControlBar?.disable();
        if (skipButtonControlBar && contentState.activeSkipKeybindElement === skipButtonControlBar) {
            contentState.activeSkipKeybindElement = null;
        }
        return;
    }

    void waitFor(() => getSkipButtonControlBar(), 5000, 10)
        .then(async (skipButtonControlBar) => {
            if (!skipButtonControlBar) {
                return;
            }

            await skipButtonControlBar.attachToPage();
            skipButtonControlBar.enable(segment);
            if (!skipButtonControlBar.isEnabled()) {
                if (contentState.activeSkipKeybindElement === skipButtonControlBar) {
                    contentState.activeSkipKeybindElement = null;
                }
                return;
            }

            skipButtonControlBar.setShowKeybindHint(Config.config.skipToHighlightKeybind != null);

            contentState.activeSkipKeybindElement?.setShowKeybindHint(false);
            contentState.activeSkipKeybindElement = skipButtonControlBar;
        })
        .catch(() => undefined);
}

export function registerSkipUIManager(): void {
    const app = getContentApp();

    app.commands.register("skip/closeNotices", ({ includeAdvance }) => closeSkipNotices(includeAdvance));
    app.commands.register("skip/dontShowNoticeAgain", () => dontShowNoticeAgain());

    app.bus.on(CONTENT_EVENTS.SKIP_NOTICE_REQUESTED, ({ noticeKind, skippingSegments, autoSkip, unskipTime, startReskip }) => {
        if (noticeKind === "advance") {
            createAdvanceSkipNotice(skippingSegments, unskipTime, autoSkip, startReskip);
            return;
        }

        createSkipNotice(skippingSegments, autoSkip, unskipTime, startReskip);
    });

    app.bus.on(CONTENT_EVENTS.SKIP_BUTTON_STATE_CHANGED, ({ enabled, segment }) => {
        applySkipButtonState(enabled, segment);
    });
}
