import Config from "../config";
import { Keybind, keybindEquals } from "../config/config";
import Utils from "../utils";
import { addCleanupListener } from "../utils/cleanup";
import { getFrameRate, getVideo } from "../utils/video";
import { getSkipButtonControlBar } from "./segmentSubmission";
import { contentState } from "./state";

export interface HotkeyHandlerDeps {
    startOrEndTimingNewSegment: () => void;
    submitSegments: () => void;
    openSubmissionMenu: () => void;
    previewRecentSegment: () => void;
}

let deps: HotkeyHandlerDeps;
const utils = new Utils();

export function initHotkeyHandler(d: HotkeyHandlerDeps): void {
    deps = d;
}

export function addHotkeyListener(): void {
    document.addEventListener("keydown", hotkeyListener);

    const onLoad = () => {
        document.removeEventListener("keydown", hotkeyListener);
        document.body.addEventListener("keydown", hotkeyListener);

        addCleanupListener(() => {
            document.body.removeEventListener("keydown", hotkeyListener);
        });
    };

    if (document.readyState === "complete") {
        onLoad();
    } else {
        document.addEventListener("DOMContentLoaded", onLoad);
    }
}

function hotkeyListener(e: KeyboardEvent): void {
    if (
        ["textarea", "input"].includes(document.activeElement?.tagName?.toLowerCase()) ||
        document.activeElement?.id?.toLowerCase()?.includes("editable")
    )
        return;

    const key: Keybind = {
        key: e.key,
        code: e.code,
        alt: e.altKey,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
    };

    const skipKey = Config.config.skipKeybind;
    const skipToHighlightKey = Config.config.skipToHighlightKeybind;
    const closeSkipNoticeKey = Config.config.closeSkipNoticeKeybind;
    const startSponsorKey = Config.config.startSponsorKeybind;
    const submitKey = Config.config.actuallySubmitKeybind;
    const previewKey = Config.config.previewKeybind;
    const openSubmissionMenuKey = Config.config.submitKeybind;

    if (keybindEquals(key, skipKey)) {
        if (contentState.activeSkipKeybindElement) {
            contentState.activeSkipKeybindElement.toggleSkip.call(contentState.activeSkipKeybindElement);

            /*
             * 视频播放器全屏或网页全屏时，快捷键`Enter`会聚焦到弹幕输入框
             * 这里阻止了使用`Enter`跳过赞助片段时播放器的默认行为
             */
            if (key.key === 'Enter') {
                const currentTime: number | null = document.querySelector<HTMLVideoElement>(".bpx-player-video-wrap video")?.currentTime ?? null;
                if (currentTime) {
                    const inSponsorRange = contentState.sponsorTimes.some(({ segment: [start, end] }) => start <= currentTime && end >= currentTime);
                    if (inSponsorRange) {
                        utils.biliBiliPlayerDanmakuInputBlur();
                    }
                }

            }
        }

        return;
    } else if (keybindEquals(key, skipToHighlightKey)) {
        if (getSkipButtonControlBar()) {
            getSkipButtonControlBar().toggleSkip.call(getSkipButtonControlBar());
        }

        return;
    } else if (keybindEquals(key, closeSkipNoticeKey)) {
        for (let i = 0; i < contentState.skipNotices.length; i++) {
            contentState.skipNotices.pop().close();
        }

        return;
    } else if (keybindEquals(key, startSponsorKey)) {
        deps.startOrEndTimingNewSegment();
        return;
    } else if (keybindEquals(key, submitKey)) {
        deps.submitSegments();
        return;
    } else if (keybindEquals(key, openSubmissionMenuKey)) {
        e.preventDefault();

        deps.openSubmissionMenu();
        return;
    } else if (keybindEquals(key, previewKey)) {
        deps.previewRecentSegment();
        return;
    }
}

/**
 * Hot keys to jump to the next or previous frame, for easier segment time editting
 * only effective when the SubmissionNotice is open
 *
 * @param key keydown event
 */
export function seekFrameByKeyPressListener(key) {
    const vid = getVideo();
    const frameRate = getFrameRate();
    if (!vid.paused) return;

    if (keybindEquals(key, Config.config.nextFrameKeybind)) {
        vid.currentTime += 1 / frameRate;
    } else if (keybindEquals(key, Config.config.previousFrameKeybind)) {
        vid.currentTime -= 1 / frameRate;
    }
}
