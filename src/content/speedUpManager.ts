import Config from "../config";
import { ActionType, SponsorTime } from "../types";
import { asyncRequestToServer } from "../requests/requests";
import { getVideo } from "../utils/video";
import { getPlaybackRateFromPlayer, setPlaybackRateViaPlayer } from "../utils/injectedScriptMessageUtils";
import { logDebug } from "../utils/logger";
import { getContentApp } from "./app";
import { CONTENT_EVENTS } from "./app/events";
import { contentState } from "./state";

// --- State ---
let isActive = false;
let originalRate = 1;
let activeSegments: SponsorTime[] = [];
let activeStartTime = 0;
let activeEndTime = 0;
let activeRate = 2;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let lastSetRate: number | null = null;
let checkInterval: NodeJS.Timeout | null = null;
const manuallyCancelledMap = new Map<string, [number, number]>();
let manuallyCancelledTimeout: NodeJS.Timeout | null = null;

const COMPLETION_EPSILON = 0.05;
const SEEK_CANCEL_THRESHOLD = 0.3;
const MANUAL_CANCEL_COOLDOWN_MS = 5000;

export function isManuallyCancelled(segment: SponsorTime): boolean {
    if (!segment?.UUID) return false;
    if (!manuallyCancelledMap.has(segment.UUID)) return false;
    const range = manuallyCancelledMap.get(segment.UUID)!;
    const v = getVideo();
    const current = v?.currentTime ?? -1;
    // Still inside blocked range (with tolerance)
    if (current >= range[0] - 0.3 && current < range[1] + 0.5) {
        return true;
    } else {
        // Left segment, clear block
        manuallyCancelledMap.delete(segment.UUID);
        return false;
    }
}

export function blockSegmentTemporarily(segment: SponsorTime): void {
    if (!segment?.UUID) return;
    scheduleManualCancelCooldown([segment]);
}

export function clearManuallyCancelled(segment: SponsorTime): void {
    if (!segment?.UUID) return;
    manuallyCancelledMap.delete(segment.UUID);
}

function parseSpeedUpRate(): number {
    const raw = Config.config.speedUpPlaybackRate as unknown as number | string;
    let rate = typeof raw === "string" ? parseFloat(raw) : raw;
    if (isNaN(rate) || !isFinite(rate)) rate = 2;
    // clamp to reasonable range 1.1 ~ 16
    rate = Math.min(16, Math.max(1.1, rate));
    return rate;
}

export function isSpeedUpActive(): boolean {
    return isActive;
}

/**
 * 返回快进前的原始倍速（用于调度计算）。
 * 当快进激活时，下一个片段的跳过会在倍速恢复为原始值后进行，
 * 因此调度 delayTime 应使用原始倍速而非当前快进倍速。
 */
export function getSpeedUpOriginalRate(): number {
    return isActive ? originalRate : 1;
}

export function getActiveSpeedUpInfo(): { segments: SponsorTime[]; start: number; end: number; rate: number } | null {
    if (!isActive) return null;
    return { segments: [...activeSegments], start: activeStartTime, end: activeEndTime, rate: activeRate };
}

export function shouldUseSpeedUp(segment: SponsorTime): boolean {
    if (!segment) return false;
    if (Config.config.disableSkipping) return false;
    if (!Config.config.enableSpeedUp) return false;
    if (contentState.channelWhitelisted) return false;
    if (segment.actionType !== ActionType.Skip) return false;
    if (segment.source === 3) { // SponsorSourceType.Danmaku
        // danmaku segments are handled separately; respect same toggle but maybe skip speedUp for danmaku
        // allow if enableAutoSkipDanmakuSkip is true
        if (!Config.config.enableAutoSkipDanmakuSkip) return false;
    }
    // Must be autoSkip candidate – import shouldAutoSkip logic via category check
    // To avoid circular import, we replicate minimal check: check categorySelections
    // However we delegate to skipScheduler.shouldAutoSkip by lazy import via function parameter?
    // For now, we check category option here using Config directly (fallback)
    // The caller (skipScheduler) will already have validated shouldAutoSkip before calling shouldUseSpeedUp,
    // so here we just check additional guards.
    const rate = parseSpeedUpRate();
    if (rate <= 1 || isNaN(rate)) return false;
    // If user manually cancelled this UUID, don't speed up again while still inside segment
    if (isManuallyCancelled(segment)) {
        return false;
    }
    // Don't speed up very short segments (<0.5s) - not worth it, fallback to skip
    const duration = segment.segment[1] - segment.segment[0];
    if (duration < 0.5) return false;
    return true;
}

// 保留异步获取用于兼容旧逻辑，当前 startSpeedUp 已改为同步捕获，不再依赖此函数
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getCurrentRate(): Promise<number> {
    try {
        const fetched = await getPlaybackRateFromPlayer();
        if (typeof fetched === "number" && isFinite(fetched) && fetched > 0) return fetched;
    } catch (error) {
        logDebug("[SB SpeedUp] error: " + String(error));
    }
    const v = getVideo();
    return v?.playbackRate ?? 1;
}

async function setRate(rate: number): Promise<boolean> {
    let success = false;
    try {
        const result = await setPlaybackRateViaPlayer(rate);
        if (result) success = true;
    } catch (error) {
        logDebug("[SB SpeedUp] error: " + String(error));
    }
    const v = getVideo();
    if (v) {
        try {
            // Always sync video element as fallback; window.player handler already does this,
            // but ensure in case player call failed.
            if (v.playbackRate !== rate) v.playbackRate = rate;
            success = true;
        } catch (error) {
            logDebug("[SB SpeedUp] error: " + String(error));
        }
    }
    lastSetRate = rate;
    logDebug(`[SB SpeedUp] setPlaybackRate ${rate} success=${success}`);
    return success;
}

function clearCheckInterval(): void {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
}

function scheduleManualCancelCooldown(segments: SponsorTime[]): void {
    for (const seg of segments) {
        manuallyCancelledMap.set(seg.UUID, [...seg.segment] as [number, number]);
    }
    if (manuallyCancelledTimeout) clearTimeout(manuallyCancelledTimeout);
    manuallyCancelledTimeout = setTimeout(() => {
        // Clear only if still blocked after cooldown – but keep map entries for segments still inside
        // To avoid indefinite blocking, clear those that are now outside current time
        const current = getVideo()?.currentTime ?? -1;
        for (const [uuid, range] of [...manuallyCancelledMap.entries()]) {
            if (current < range[0] - 0.3 || current >= range[1] + 0.5) {
                manuallyCancelledMap.delete(uuid);
            }
        }
        // If still have entries that are inside, keep timeout to re-check
        if (manuallyCancelledMap.size > 0) {
            manuallyCancelledTimeout = setTimeout(() => {
                manuallyCancelledMap.clear();
                manuallyCancelledTimeout = null;
            }, MANUAL_CANCEL_COOLDOWN_MS);
        } else {
            manuallyCancelledTimeout = null;
        }
    }, MANUAL_CANCEL_COOLDOWN_MS);
}

// Helper retained for potential external use but currently unused
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function scheduleManualCancelCooldownByUUIDs(uuids: string[]): void {
    const segs: SponsorTime[] = [];
    for (const uuid of uuids) {
        const found = activeSegments.find(s => s.UUID === uuid) || contentState.sponsorTimes?.find(s => s.UUID === uuid);
        if (found) segs.push(found);
        else segs.push({ UUID: uuid as unknown as string, segment: [0, Number.MAX_SAFE_INTEGER], category: "" as unknown as string, actionType: ActionType.Skip, source: 0 } as SponsorTime);
    }
    scheduleManualCancelCooldown(segs);
}

function sendTelemetryForSpeedUp(segments: SponsorTime[], rate: number): void {
    if (!Config.config.trackViewCount || (!Config.config.trackViewCountInPrivate && (chrome as unknown as { extension: { inIncognitoContext: boolean } }).extension?.inIncognitoContext)) {
        return;
    }
    // Need to access sponsorSkipped from skipScheduler state – we maintain own simple check via contentState index lookup
    // Replicate logic from skipScheduler
    let counted = false;
    for (const segment of segments) {
        const idx = contentState.sponsorTimes?.findIndex((s) => s.UUID === segment.UUID);
        if (idx !== -1) {
            // Use global skipScheduler's sponsorSkipped via import workaround: we store via contentState? Instead we import getSponsorSkipped?
            // For simplicity, we directly manage via Config and server request, not de-duplicate with scheduler's array.
            // But we should try to avoid double counting.
            if (!counted) {
                const duration = segment.segment[1] - segment.segment[0];
                const saved = duration * (1 - 1 / rate);
                Config.config.minutesSaved = Config.config.minutesSaved + saved / 60;
                Config.config.skipCount = Config.config.skipCount + 1;
                counted = true;
            }
            // Mark as viewed
            try {
                void asyncRequestToServer("POST", "/api/viewedVideoSponsorTime?UUID=" + segment.UUID);
            } catch (error) {
                logDebug("[SB SpeedUp] error: " + String(error));
            }
        }
    }
}

async function checkCompletion(): Promise<void> {
    if (!isActive) return;
    const video = getVideo();
    if (!video) {
        await cancelSpeedUp(true);
        return;
    }
    const current = video.currentTime;

    // Completed: reached or passed end
    if (current >= activeEndTime - COMPLETION_EPSILON) {
        logDebug(`[SB SpeedUp] completed segment ${activeStartTime} -> ${activeEndTime} at ${current}`);
        const completedSegments = [...activeSegments];
        const completedRate = activeRate;
        const completedEnd = activeEndTime;
        const restoreTo = originalRate;

        // Cleanup before restore to avoid re-entrance
        clearCheckInterval();
        detachTimeUpdateListener(video);
        isActive = false;
        activeSegments = [];
        // 同步恢复确保及时生效，再异步校正 window.player
        try {
            if (video.playbackRate !== restoreTo) video.playbackRate = restoreTo;
        } catch (error) {
            logDebug("[SB SpeedUp] error: " + String(error));
        }
        lastSetRate = null;
        try {
            await setRate(restoreTo);
        } catch (error) {
            logDebug("[SB SpeedUp] error: " + String(error));
        }

        // Telemetry
        sendTelemetryForSpeedUp(completedSegments, completedRate);

        // 关闭对应的手动快进 notice，避免显示时间与实际快进结束后仍残留对不上
        try {
            for (const notice of [...contentState.skipNotices]) {
                if (notice.segments.some((s) => completedSegments.some((cs) => cs.UUID === s.UUID))) {
                    notice.close();
                }
            }
        } catch (error) {
            logDebug("[SB SpeedUp] error: " + String(error));
        }

        // Emit completion events for UI (reuse skip executed semantics but as speedUp)
        try {
            getContentApp().bus.emit(CONTENT_EVENTS.SKIP_EXECUTED, {
                skipTime: [completedSegments[0].segment[0], completedEnd] as [number, number],
                skippingSegments: completedSegments,
                autoSkip: true,
                openNotice: false,
            }, { source: "speedUpManager.checkCompletion" });
        } catch (error) {
            logDebug("[SB SpeedUp] error: " + String(error));
        }

        // Schedule next segments
        try {
            const app = getContentApp();
            // Use includeNonIntersecting false to avoid re-triggering same segment, but need to handle overlapping
            void app.commands.execute("skip/startSchedule", {
                includeIntersectingSegments: true,
                currentTime: completedEnd + 0.01,
                includeNonIntersectingSegments: false,
            });
            // Also trigger general schedule after short delay for safety
            setTimeout(() => {
                void app.commands.execute("skip/startSchedule", {});
            }, 200);
        } catch (error) {
            logDebug("[SB SpeedUp] error: " + String(error));
        }
        return;
    }

    // If current time went far outside expected range (user seek or loop)
    if (current < activeStartTime - SEEK_CANCEL_THRESHOLD) {
        // User rewound before start
        logDebug(`[SB SpeedUp] cancel due to rewind ${current} < ${activeStartTime}`);
        await cancelSpeedUp(true, true);
        return;
    }
    if (current > activeEndTime + 1) {
        // Jumped beyond end (e.g., user seeked past)
        logDebug(`[SB SpeedUp] cancel due to jump beyond end ${current} > ${activeEndTime}`);
        await cancelSpeedUp(true, true);
        return;
    }
    // If video looped to 0 while speeding (unlikely)
    if (video.loop && current < 0.2 && activeStartTime > 1) {
        await cancelSpeedUp(true, true);
        return;
    }
}

let boundTimeUpdateHandler: (() => void) | null = null;

function attachTimeUpdateListener(video: HTMLVideoElement): void {
    if (boundTimeUpdateHandler) return;
    boundTimeUpdateHandler = () => {
        void checkCompletion();
    };
    video.addEventListener("timeupdate", boundTimeUpdateHandler);
    video.addEventListener("seeked", boundTimeUpdateHandler);
}

function detachTimeUpdateListener(video: HTMLVideoElement | null): void {
    if (!video || !boundTimeUpdateHandler) return;
    try {
        video.removeEventListener("timeupdate", boundTimeUpdateHandler);
        video.removeEventListener("seeked", boundTimeUpdateHandler);
    } catch (error) {
        logDebug("[SB SpeedUp] error: " + String(error));
    }
    boundTimeUpdateHandler = null;
}

export async function startSpeedUp(skippingSegments: SponsorTime[], skipTime: number[], forcedOriginalRate?: number): Promise<boolean> {
    if (!skippingSegments?.length || !skipTime?.length) return false;
    const primary = skippingSegments[0];
    if (!shouldUseSpeedUp(primary)) return false;

    const video = getVideo();
    if (!video) return false;

    const rate = parseSpeedUpRate();

    // If already active for same primary UUID, just update end if needed
    if (isActive && activeSegments[0]?.UUID === primary.UUID) {
        // Update end if merged duration extended
        if (skipTime[1] > activeEndTime) {
            activeEndTime = skipTime[1];
            activeSegments = skippingSegments;
        }
        return true;
    }

    // If active for different segment, cancel previous first (await restore)
    if (isActive) {
        await cancelSpeedUp(true, false);
    }

    // 优先使用调用方传入的原速率（在同步设置快进速率之前捕获），避免异步读取到已是快进速率
    if (typeof forcedOriginalRate === "number" && isFinite(forcedOriginalRate) && forcedOriginalRate > 0) {
        originalRate = forcedOriginalRate;
    } else {
        // 同步捕获原速率，避免异步 getPlaybackRate 在已切到快进速率后才读取导致无法恢复
        let capturedRate: number | null = null;
        try {
            capturedRate = video.playbackRate;
        } catch {
            capturedRate = null;
        }
        if (typeof capturedRate !== "number" || !isFinite(capturedRate) || capturedRate <= 0) {
            capturedRate = 1;
        }
        originalRate = capturedRate;
    }

    // If original already very close to target, still proceed but avoid unnecessary set
    activeSegments = skippingSegments;
    activeStartTime = skipTime[0];
    activeEndTime = skipTime[1];
    activeRate = rate;

    // Edge: if currentTime already near end, don't speed up
    if (video.currentTime >= activeEndTime - COMPLETION_EPSILON) {
        logDebug(`[SB SpeedUp] abort start - already past end ${video.currentTime} >= ${activeEndTime}`);
        activeSegments = [];
        return false;
    }

    logDebug(`[SB SpeedUp] start ${activeStartTime} -> ${activeEndTime} rate=${rate} original=${originalRate}`);

    isActive = true;

    // 先同步设置 video 速率，确保后续 timeupdate 立即以新速率推进；再异步通过 window.player 校正
    try {
        if (video.playbackRate !== rate) video.playbackRate = rate;
        lastSetRate = rate;
    } catch (error) {
        logDebug("[SB SpeedUp] error: " + String(error));
    }
    // 异步通过 window.player 设置，失败不影响已同步的 video 速率
    void setRate(rate).catch((error) => { logDebug("[SB SpeedUp] promise rejected: " + String(error)); });

    clearCheckInterval();
    checkInterval = setInterval(() => {
        void checkCompletion();
    }, 100);
    attachTimeUpdateListener(video);

    // 立即检查一次，防止已在结束位置附近
    void checkCompletion();

    return true;
}

export async function cancelSpeedUp(restoreRate = true, isManual = false): Promise<void> {
    if (!isActive && !checkInterval && !boundTimeUpdateHandler) return;
    const cancelledSegments = [...activeSegments];
    const wasActive = isActive;
    // 同步阻塞：防止 SEEKING 事件在异步恢复速率期间重新触发同一片段的快进/跳过（修复 启用快进+快进到片段中间仍跳过后取消失效）
    if (isManual && cancelledSegments.length > 0) {
        for (const seg of cancelledSegments) {
            manuallyCancelledMap.set(seg.UUID, [...seg.segment] as [number, number]);
        }
    }
    logDebug(`[SB SpeedUp] cancel restore=${restoreRate} manual=${isManual} wasActive=${wasActive}`);
    clearCheckInterval();
    const videoForDetach = getVideo();
    detachTimeUpdateListener(videoForDetach);
    isActive = false;
    activeSegments = [];
    if (restoreRate) {
        const restoreTo = originalRate;
        // 同步恢复
        const v = getVideo();
        if (v) {
            try {
                if (v.playbackRate !== restoreTo) v.playbackRate = restoreTo;
            } catch (error) {
                logDebug("[SB SpeedUp] error: " + String(error));
            }
        }
        try {
            await setRate(restoreTo);
        } catch {
            if (v) try { v.playbackRate = restoreTo; } catch (error) {
                logDebug("[SB SpeedUp] error: " + String(error));
            }
        }
        lastSetRate = null;
    }
    if (isManual && cancelledSegments.length > 0) {
        scheduleManualCancelCooldown(cancelledSegments);
    }
    // If was active and not manual cooldown, trigger reschedule after short delay
    if (wasActive && !isManual) {
        try {
            const app = getContentApp();
            setTimeout(() => {
                void app.commands.execute("skip/startSchedule", {});
            }, 150);
        } catch (error) {
            logDebug("[SB SpeedUp] error: " + String(error));
        }
    } else if (wasActive && isManual) {
        // For manual cancel, we should still schedule but shouldUseSpeedUp will block re-entry for same UUID
        try {
            const app = getContentApp();
            setTimeout(() => {
                // Schedule with includeNonIntersecting=false to avoid immediate re-speedup of same segment
                // But we want to allow next distinct segments to still speed up
                void app.commands.execute("skip/startSchedule", {
                    includeIntersectingSegments: false,
                    currentTime: getVideo()?.currentTime,
                    includeNonIntersectingSegments: true,
                });
            }, 200);
        } catch (error) {
            logDebug("[SB SpeedUp] error: " + String(error));
        }
    }
}

export function resetSpeedUpState(): void {
    // If active, attempt to restore original rate before clearing
    const v = getVideo();
    if (isActive && v) {
        const restoreTo = originalRate || 1;
        // Try synchronous restore first, then async via player
        try { if (v.playbackRate !== restoreTo) v.playbackRate = restoreTo; } catch (error) {
            logDebug("[SB SpeedUp] error: " + String(error));
        }
        void setRate(restoreTo).catch((error) => { logDebug("[SB SpeedUp] setRate failed: " + String(error)); });
        detachTimeUpdateListener(v);
    } else if (v) {
        detachTimeUpdateListener(v);
    }
    clearCheckInterval();
    isActive = false;
    activeSegments = [];
    activeStartTime = 0;
    activeEndTime = 0;
    originalRate = 1;
    lastSetRate = null;
    manuallyCancelledMap.clear();
    if (manuallyCancelledTimeout) {
        clearTimeout(manuallyCancelledTimeout);
        manuallyCancelledTimeout = null;
    }
}

export function registerSpeedUpManager(): void {
    const app = getContentApp();

    // Seeking during speedUp => cancel and treat as manual
    app.bus.on(CONTENT_EVENTS.PLAYER_SEEKING, () => {
        if (!isActive) return;
        // Any seeking while active is considered manual interaction per spec
        // We cancel and mark as manual to prevent immediate re-speedup of same segment
        void cancelSpeedUp(true, true);
    });

    app.bus.on(CONTENT_EVENTS.PLAYER_PAUSE, () => {
        if (!isActive) return;
        // Pause: keep speedUp state but pause interval? We cancel to restore rate, but will restart on play if still inside
        // To avoid rate stuck at high while paused, restore now; scheduler will re-enter on play
        void cancelSpeedUp(true, false);
    });

    app.bus.on(CONTENT_EVENTS.PLAYER_WAITING, () => {
        // Buffering: don't cancel, keep rate
    });

    app.bus.on(CONTENT_EVENTS.PLAYER_RATE_CHANGED, ({ playbackRate }) => {
        if (!isActive) return;
        // If rate changed externally and not equal to our target, user manually changed rate
        if (Math.abs(playbackRate - activeRate) > 0.12) {
            logDebug(`[SB SpeedUp] external rate change ${playbackRate} != ${activeRate} -> cancel without restore`);
            // User changed rate manually; cancel but don't restore (keep user's choice)
            const cancelled = [...activeSegments];
            clearCheckInterval();
            detachTimeUpdateListener(getVideo());
            isActive = false;
            activeSegments = [];
            // Update originalRate to user's new choice so future restores use it
            originalRate = playbackRate;
            lastSetRate = null;
            if (cancelled.length > 0) scheduleManualCancelCooldown(cancelled);
            // Don't restore originalRate
        }
    });

    app.bus.on(CONTENT_EVENTS.VIDEO_RESET_REQUESTED, () => {
        resetSpeedUpState();
    });

    app.bus.on(CONTENT_EVENTS.VIDEO_ELEMENT_CHANGED, () => {
        resetSpeedUpState();
    });

    app.bus.on(CONTENT_EVENTS.CONFIG_CHANGED, ({ changes }) => {
        // Access via any to avoid type strictness
        const c = changes as unknown as Record<string, unknown>;
        if (c["enableSpeedUp"] !== undefined || c["speedUpPlaybackRate"] !== undefined) {
            if (!Config.config.enableSpeedUp && isActive) {
                void cancelSpeedUp(true, false);
            } else if (isActive && c["speedUpPlaybackRate"] !== undefined) {
                // Rate changed mid-speedUp: update to new rate
                const newRate = parseSpeedUpRate();
                if (Math.abs(newRate - activeRate) > 0.05) {
                    activeRate = newRate;
                    void setRate(newRate).catch((error) => { logDebug("[SB SpeedUp] setRate failed: " + String(error)); });
                }
            }
        }
        if (c["disableSkipping"] !== undefined && Config.config.disableSkipping && isActive) {
            void cancelSpeedUp(true, false);
        }
    });

    app.bus.on(CONTENT_EVENTS.CHANNEL_WHITELIST_CHANGED, ({ whitelisted }) => {
        if (whitelisted && isActive) {
            void cancelSpeedUp(true, false);
        }
    });
}
