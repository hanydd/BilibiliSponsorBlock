import Config from "../config";
import { isSkipSeek } from "./skipSeek";
import SkipNotice from "../render/SkipNotice";
import { SponsorTime } from "../types";
import { waitFor } from "../utils/";
import { getContentApp } from "./app";
import { CONTENT_EVENTS } from "./app/events";
import { contentState, executedRangeEndTolerance, executedRangeStartTolerance } from "./state";
import { getSkipNoticeContentContainer } from "./skipNoticeContentContainer";
import { noticeSegmentsContain, noticeSegmentsIntersect } from "../utils/noticeUtils";

function getSkipButtonControlBar() {
    return getContentApp().ui.getState().skipButtonControlBar;
}

function selectNoticeTarget(preferred?: SkipNotice): void {
    const actionable = contentState.skipNotices.filter(notice => notice.actionable);
    const target = actionable.find(notice => notice.focused) ?? actionable.find(notice => notice.hovered) ?? preferred ?? actionable[actionable.length - 1]
        ?? (getSkipButtonControlBar()?.isEnabled() ? getSkipButtonControlBar() : null);
    if (target === contentState.activeSkipKeybindElement) return;
    contentState.activeSkipKeybindElement?.setShowKeybindHint(false);
    contentState.activeSkipKeybindElement = target;
    target?.setShowKeybindHint(target instanceof SkipNotice ? Config.config.skipKeybind != null : Config.config.skipToHighlightKeybind != null);
}

function removeSkipNotice(notice: SkipNotice): void {
    const index = contentState.skipNotices.indexOf(notice);
    if (index >= 0) contentState.skipNotices.splice(index, 1);
    if (contentState.activeSkipKeybindElement === notice) selectNoticeTarget();
}

function closeAdvanceSkipNotice(): void {
    contentState.advanceSkipNotices?.close();
}

function closeSkipNotices(includeAdvance = false): void {
    for (const notice of [...contentState.skipNotices]) {
        if (includeAdvance || !notice.upcoming) notice.close();
    }
}

function closeSkipNoticesForSegments(segments: SponsorTime[]): void {
    // close 会经回调从 skipNotices 中移除自身，故遍历副本
    for (const notice of [...contentState.skipNotices]) {
        if (noticeSegmentsIntersect(notice.segments, segments)) {
            notice.close();
        }
    }
}

function dontShowNoticeAgain(): void {
    Config.config.dontShowNotice = true;
    closeSkipNotices(true);
}

function showNotice(skippingSegments: SponsorTime[], autoSkip: boolean, unskipTime: number,
    startReskip: boolean, upcoming: boolean): void {
    const existing = contentState.skipNotices.find(notice => !notice.closed && notice.isCurrentVideo() &&
        (notice.sameNotice(skippingSegments) || (!upcoming && notice.upcoming && notice.contains(skippingSegments))));
    if (existing && existing.upcoming === upcoming) return;
    // A later subset of an already visible merged result is the same notice.
    if (!upcoming && contentState.skipNotices.some(notice => !notice.closed && !notice.upcoming && notice.isCurrentVideo() &&
        noticeSegmentsContain(notice.segments, skippingSegments) &&
        Math.min(...skippingSegments.map(segment => segment.segment[0])) >= Math.min(...notice.segments.map(segment => segment.segment[0])) - executedRangeStartTolerance &&
        Math.max(...skippingSegments.map(segment => segment.segment[1])) <= Math.max(...notice.segments.map(segment => segment.segment[1])) + executedRangeEndTolerance)) return;
    const update = { segments: skippingSegments, autoSkip, unskipTime, startReskip, upcoming };
    if (existing) {
        existing.update(update);
        selectNoticeTarget(existing);
        return;
    }
    closeAdvanceSkipNotice();
    const notice = new SkipNotice(update, getSkipNoticeContentContainer, removeSkipNotice, () => selectNoticeTarget());
    if (notice.closed) return;
    contentState.skipNotices.push(notice);
    selectNoticeTarget(notice);
}

function applySkipButtonState(enabled: boolean, segment: SponsorTime | null): void {
    if (!enabled || !segment) {
        const skipButtonControlBar = getSkipButtonControlBar();
        skipButtonControlBar?.disable();
        if (skipButtonControlBar && contentState.activeSkipKeybindElement === skipButtonControlBar) {
            selectNoticeTarget();
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
                    selectNoticeTarget();
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

    app.bus.on(CONTENT_EVENTS.PLAYER_SEEKING, ({ video }) => {
        if (isSkipSeek(video)) return;
        // Small corrections around a segment keep its controls; unrelated old
        // notices (including manually paused ones) do not follow a user seek.
        const nearby = (segments: SponsorTime[], lead = 5) => segments.some(({ segment }) =>
            video.currentTime >= segment[0] - lead && video.currentTime <= (segment[1] ?? segment[0]) + 5);
        for (const notice of [...contentState.skipNotices]) {
            const pastPreview = notice.upcoming && notice.segments.every(segment => video.currentTime >= segment.segment[1]);
            if (pastPreview || !nearby(notice.segments, notice.upcoming ? Math.max(5, Number(Config.config.skipNoticeDurationBefore)) : 5)) notice.close();
        }
    });

    app.commands.register("skip/closeNotices", ({ includeAdvance }) => closeSkipNotices(includeAdvance));
    app.commands.register("skip/closeNoticesForSegments", ({ segments }) => closeSkipNoticesForSegments(segments));
    app.commands.register("skip/dontShowNoticeAgain", () => dontShowNoticeAgain());

    app.bus.on(CONTENT_EVENTS.SKIP_NOTICE_REQUESTED, ({ noticeKind, skippingSegments, autoSkip, unskipTime, startReskip }) => {
        if (Config.config.dontShowNotice) return;
        if (noticeKind === "advance") {
            if (!Config.config.advanceSkipNotice || Config.config.skipNoticeDurationBefore <= 0) return;
            showNotice(skippingSegments, autoSkip, unskipTime, startReskip, true);
            return;
        }

        showNotice(skippingSegments, autoSkip, unskipTime, startReskip, false);
    });

    app.bus.on(CONTENT_EVENTS.CONFIG_CHANGED, ({ changes }) => {
        if ("dontShowNotice" in changes && Config.config.dontShowNotice) {
            closeSkipNotices(true);
        } else if (("advanceSkipNotice" in changes || "skipNoticeDurationBefore" in changes) &&
            (!Config.config.advanceSkipNotice || Config.config.skipNoticeDurationBefore <= 0) ||
            ("disableSkipping" in changes && Config.config.disableSkipping)) {
            closeAdvanceSkipNotice();
        }
    });

    app.bus.on(CONTENT_EVENTS.SKIP_BUTTON_STATE_CHANGED, ({ enabled, segment }) => {
        applySkipButtonState(enabled, segment);
    });
}
