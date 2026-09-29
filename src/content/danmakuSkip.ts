import Config from "../config";
import { contentState } from "./state";
import {
    ActionType,
    Category,
    SegmentUUID,
    SponsorSourceType,
    SponsorTime,
} from "../types";
import { addCleanupListener } from "../utils/cleanup";
import { parseTargetTimeFromDanmaku } from "../utils/danmakusUtils";
import { getCid, getVideo } from "../utils/video";
import { generateUserID } from "../utils/setup";
import { getContentApp } from "./app";

let danmakuObserver: MutationObserver = null;
const processedDanmaku = new Set<string>();

function checkDanmaku(text: string, offset: number, targetTime?: number | null) {
    const getVirtualTime = () => getContentApp().commands.execute("skip/getVirtualTime", undefined) as number;
    if (targetTime === undefined) targetTime = parseTargetTimeFromDanmaku(text, getVirtualTime());
    if (targetTime === null) return;

    const startTime = getVirtualTime() + offset;

    if (targetTime < startTime + 5) return;
    if (targetTime > getVideo().duration) return;

    if (
        Config.config.checkTimeDanmakuSkip &&
        (getContentApp().commands.execute("skip/isSegmentMarkedNearCurrentTime", { currentTime: startTime }) as boolean)
    ) {
        return;
    }

    const skippingSegments: SponsorTime[] = [
        {
            cid: getCid(),
            actionType: ActionType.Skip,
            segment: [startTime, targetTime],
            source: SponsorSourceType.Danmaku,
            UUID: generateUserID() as SegmentUUID,
            category: "sponsor" as Category,
        },
    ];

    setTimeout(() => {
        void getContentApp().commands.execute("skip/execute", {
            v: getVideo(),
            skipTime: [startTime, targetTime],
            skippingSegments,
            openNotice: true,
            forceAutoSkip: Config.config.enableAutoSkipDanmakuSkip,
            unskipTime: startTime,
        });
        if (Config.config.enableMenuDanmakuSkip) {
            setTimeout(() => {
                if (!contentState.sponsorTimesSubmitting?.some((s) => s.segment[1] === skippingSegments[0].segment[1])) {
                    void getContentApp().commands.execute("segments/addSubmitting", {
                        segment: skippingSegments[0],
                        source: "danmakuSkip.checkDanmaku",
                    });
                }
                void getContentApp().commands.execute("segment/openSubmissionMenu", undefined);
            }, Config.config.skipNoticeDuration * 1000 + 500);
        }
    }, offset * 1000 - 100);
}

export function danmakuForSkip(): void {
    if ((!Config.config.enableDanmakuSkip && !Config.config.enableClickableTimeDanmaku) || Config.config.disableSkipping) return;
    if (danmakuObserver) return;

    const targetNode = document.querySelector(".bpx-player-row-dm-wrap");
    if (!targetNode) return;
    const timeAttribute = "data-bsb-jump-time";
    const style = document.createElement("style");
    style.textContent = "[" + timeAttribute + "] { text-decoration: underline !important; cursor: pointer !important; pointer-events: auto !important; }";
    document.head.appendChild(style);
    const onClick = (event: MouseEvent) => {
        if (!Config.config.enableClickableTimeDanmaku || Config.config.disableSkipping) return;
        const target = (event.target as Element)?.closest<HTMLElement>("[" + timeAttribute + "]");
        const video = getVideo();
        if (!target || !video ||
            !target.classList.contains("bili-danmaku-x-show") || target.dataset.bsbJumpText !== target.textContent) return;
        const time = Number(target.getAttribute(timeAttribute));
        if (!Number.isFinite(time) || time < 0 || time > video.duration) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        video.currentTime = time;
    };
    targetNode.addEventListener("click", onClick, true);
    const config = { attributes: true, attributeFilter: ["class", "style"], subtree: true };
    const callback = (mutationsList: MutationRecord[]) => {
        if ((!Config.config.enableDanmakuSkip && !Config.config.enableClickableTimeDanmaku) || Config.config.disableSkipping) return;
        for (const mutation of mutationsList) {
            const target = mutation.target as HTMLElement;
            if (mutation.type === "attributes" && target.classList.contains("bili-danmaku-x-dm")) {
                const content = mutation.target.textContent;
                if (target.classList.contains("bili-danmaku-x-show")) {
                    if (Config.config.enableClickableTimeDanmaku && content && target.dataset.bsbJumpText !== content) {
                        const video = getVideo();
                        const currentTime = Config.config.enableDanmakuSkip
                            ? getContentApp().commands.execute("skip/getVirtualTime", undefined) as number
                            : video?.currentTime ?? 0;
                        const time = parseTargetTimeFromDanmaku(content, currentTime);
                        target.dataset.bsbJumpText = content;
                        if (video && time !== null && Number.isFinite(time) && time >= 0 && time <= video.duration) {
                            target.setAttribute(timeAttribute, String(time));
                        } else {
                            target.removeAttribute(timeAttribute);
                        }
                    }
                    if (targetNode.classList.contains("bili-danmaku-x-paused")) continue;
                    if (!Config.config.enableDanmakuSkip || !content || processedDanmaku.has(content)) {
                        continue;
                    }
                    let matchedTime: number | null | undefined;
                    if (Config.config.enableClickableTimeDanmaku && target.dataset.bsbJumpText === content) {
                        const time = target.getAttribute(timeAttribute);
                        matchedTime = time === null ? null : Number(time);
                    }
                    processedDanmaku.add(content);
                    const offset = target.classList.contains("bili-danmaku-x-center") ? 0.3 : 1;
                    checkDanmaku(content, offset, matchedTime);
                } else {
                    target.removeAttribute(timeAttribute);
                    delete target.dataset.bsbJumpText;
                    if (!content || processedDanmaku.has(content)) {
                        processedDanmaku.delete(content);
                    }
                }
            }
        }
    };
    danmakuObserver = new MutationObserver(callback);
    danmakuObserver.observe(targetNode, config);
    addCleanupListener(() => {
        if (danmakuObserver) {
            danmakuObserver.disconnect();
            danmakuObserver = null;
            processedDanmaku.clear();
            targetNode.removeEventListener("click", onClick, true);
            targetNode.querySelectorAll<HTMLElement>("[data-bsb-jump-text]").forEach(target => {
                target.removeAttribute(timeAttribute);
                delete target.dataset.bsbJumpText;
            });
            style.remove();
            return;
        }
    });
}
