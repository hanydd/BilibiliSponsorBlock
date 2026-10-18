import Config from "../config";
import { Keybind, keybindEquals } from "../config/config";
import Utils from "../utils";
import { addCleanupListener } from "../utils/cleanup";
import { getFrameRate, getVideo } from "../utils/video";
import { getContentApp } from "./app";
import { getRuleRuntime } from "./skipRules/bridge";
import { contentState } from "./state";
import { observePlayerSurfaces } from "../player/PlayerSurface";

const utils = new Utils();

function getSkipButtonControlBar() {
    return getContentApp().ui.getState().skipButtonControlBar;
}

export function addHotkeyListener(): void {
    addCleanupListener(observePlayerSurfaces(surface => {
        const doc = surface.document;
        let target: Document | HTMLElement = doc;
        const onLoad = () => {
            target.removeEventListener("keydown", hotkeyListener);
            target = doc.body;
            target.addEventListener("keydown", hotkeyListener);
        };
        target.addEventListener("keydown", hotkeyListener);
        if (doc.body) onLoad();
        else doc.addEventListener("DOMContentLoaded", onLoad, { once: true });
        return () => {
            target.removeEventListener("keydown", hotkeyListener);
            doc.removeEventListener("DOMContentLoaded", onLoad);
        };
    }));
}

function hotkeyListener(e: KeyboardEvent): void {
    const node = e.target as Node;
    const doc = node?.nodeType === 9 ? node as Document : node?.ownerDocument ?? document;
    const target = node?.nodeType === 1 ? node as HTMLElement : doc.activeElement as HTMLElement;
    // Yield our shortcuts to text/form controls without cancelling the page's event.
    if (
        e.defaultPrevented || target?.isContentEditable ||
        target?.closest("input, textarea, select") ||
        doc.activeElement?.id?.toLowerCase()?.includes("editable")
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
    const cardButton = target?.closest<HTMLButtonElement>(".sponsorSkipStackCard button");
    if (cardButton && (e.key === "Enter" || e.key === " ")) {
        // Only our configured activation key is ours to handle. Activate the focused
        // action instead of also skipping; Bilibili may cancel its native Enter click.
        if (keybindEquals(key, skipKey)) {
            e.preventDefault();
            cardButton.click();
        }
        return;
    }
    const skipToHighlightKey = Config.config.skipToHighlightKeybind;
    const closeSkipNoticeKey = Config.config.closeSkipNoticeKeybind;
    const startSponsorKey = Config.config.startSponsorKeybind;
    const submitKey = Config.config.actuallySubmitKeybind;
    const previewKey = Config.config.previewKeybind;
    const openSubmissionMenuKey = Config.config.submitKeybind;

    if (keybindEquals(key, skipKey)) {
        const hiddenAction = getRuleRuntime()?.toggleSkip();
        if (hiddenAction || contentState.activeSkipKeybindElement) {
            if (!hiddenAction) contentState.activeSkipKeybindElement.toggleSkip.call(contentState.activeSkipKeybindElement);

            /*
             * 视频播放器全屏或网页全屏时，快捷键`Enter`会聚焦到弹幕输入框
             * 这里阻止了使用`Enter`跳过赞助片段时播放器的默认行为
             */
            if (key.key === 'Enter') {
                const currentTime = getVideo()?.currentTime ?? null;
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
        void getContentApp().commands.execute("skip/closeNotices", { includeAdvance: false, dismiss: true });

        return;
    } else if (keybindEquals(key, startSponsorKey)) {
        void getContentApp().commands.execute("segment/toggleCapture", undefined);
        return;
    } else if (keybindEquals(key, submitKey)) {
        void getContentApp().commands.execute("segment/submit", undefined);
        return;
    } else if (keybindEquals(key, openSubmissionMenuKey)) {
        e.preventDefault();

        void getContentApp().commands.execute("segment/openSubmissionMenu", undefined);
        return;
    } else if (keybindEquals(key, previewKey)) {
        void getContentApp().commands.execute("segment/previewRecent", undefined);
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
