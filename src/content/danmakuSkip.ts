import Config from "../config";
import { contentState } from "./state";
import {
    ActionType,
    Category,
    SegmentUUID,
    SkipToTimeParams,
    SponsorSourceType,
    SponsorTime,
} from "../types";
import { addCleanupListener } from "../utils/cleanup";
import { parseTargetTimeFromDanmaku } from "../utils/danmakusUtils";
import { getCid, getVideo } from "../utils/video";
import { generateUserID } from "../utils/setup";

export interface DanmakuSkipDeps {
    getVirtualTime: () => number;
    isSegmentMarkedNearCurrentTime: (currentTime: number, range?: number) => boolean;
    skipToTime: (params: SkipToTimeParams) => void;
    openSubmissionMenu: () => void;
}

let danmakuObserver: MutationObserver = null;
const processedDanmaku = new Set<string>();

let deps: DanmakuSkipDeps;

export function initDanmakuSkip(d: DanmakuSkipDeps): void {
    deps = d;
}

function checkDanmaku(text: string, offset: number) {
    const targetTime = parseTargetTimeFromDanmaku(text, deps.getVirtualTime());
    if (targetTime === null) return;

    const startTime = deps.getVirtualTime() + offset;

    if (targetTime < startTime + 5) return;
    if (targetTime > getVideo().duration) return;

    if (Config.config.checkTimeDanmakuSkip && deps.isSegmentMarkedNearCurrentTime(startTime)) return;

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
        deps.skipToTime({
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
                    contentState.sponsorTimesSubmitting.push(skippingSegments[0]);
                }
                deps.openSubmissionMenu();
            }, Config.config.skipNoticeDuration * 1000 + 500);
        }
    }, offset * 1000 - 100);
}

export function danmakuForSkip(): void {
    if (!Config.config.enableDanmakuSkip || Config.config.disableSkipping) return;
    if (danmakuObserver) return;

    const targetNode = document.querySelector(".bpx-player-row-dm-wrap");
    const config = { attributes: true, subtree: true };
    const callback = (mutationsList: MutationRecord[]) => {
        if (!Config.config.enableDanmakuSkip || Config.config.disableSkipping) return;
        if (targetNode.classList.contains("bili-danmaku-x-paused")) return;
        for (const mutation of mutationsList) {
            const target = mutation.target as HTMLElement;
            if (mutation.type === "attributes" && target.classList.contains("bili-danmaku-x-dm")) {
                const content = mutation.target.textContent;
                if (target.classList.contains("bili-danmaku-x-show")) {
                    if (!content || processedDanmaku.has(content)) {
                        continue;
                    }
                    processedDanmaku.add(content);
                    const offset = target.classList.contains("bili-danmaku-x-center") ? 0.3 : 1;
                    checkDanmaku(content, offset);
                } else {
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
            return;
        }
    });
}
