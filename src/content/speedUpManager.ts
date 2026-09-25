import Config from "../config";
import { ActionType, SponsorHideType, SponsorTime } from "../types";
import { getVideo } from "../utils/video";
import { logDebug } from "../utils/logger";
import { getContentApp } from "./app";
import { CONTENT_EVENTS } from "./app/events";
import { contentState, skipBuffer } from "./state";

/** 一次快进的上下文：活跃会话与暂停暂存共用（暂停恢复时倍速由 startSpeedUp 重算，故不含 rate）。 */
interface SpeedUpContext {
    segments: SponsorTime[];
    start: number;
    end: number;
    /** 快进前的原始倍速（恢复倍速与调度计算用） */
    originalRate: number;
}

/** 活跃会话：上下文 + 被改倍速的元素 + 自身定时器/监听器，停机时由 deactivate 统一回收。 */
interface SpeedUpSession extends SpeedUpContext {
    // 恢复/解绑必须作用于该元素，否则 VIDEO_ELEMENT_CHANGED 后 getVideo() 返回新元素，旧元素残留高倍速
    video: HTMLVideoElement;
    rate: number;
    checkInterval: ReturnType<typeof setInterval> | null;
    completionTimeout: ReturnType<typeof setTimeout> | null;
    timeUpdateHandler: (() => void) | null;
}

let session: SpeedUpSession | null = null;
/** PAUSE 时暂存的上下文，PLAY 后仍在段内则恢复（长暂停场景） */
let pausedSession: SpeedUpContext | null = null;
/** 内嵌 Mute 静音态：精确定时器与对应时间线（墙钟基准），轮询以其抑制误恢复 */
const muteState: {
    muted: boolean;
    timers: ReturnType<typeof setTimeout>[];
    windows: Array<{ entryAt: number; exitAt: number }>;
} = { muted: false, timers: [], windows: [] };
const manuallyCancelledMap = new Map<string, { range: [number, number]; expiresAt: number }>();
/** 事件去重时间戳：忽略自身写倍速触发的 ratechange，以及 PLAY/PLAYING 双事件重复处理 */
const lastEventAt = { programmaticRate: -Infinity, resumeAttempt: -Infinity };

/** 完成判定容差（秒）：视频时间进入「距结尾不足 epsilon」即判完成，抹平定时器触发与取整误差 */
const COMPLETION_EPSILON = 0.05;

function safeCommand(callback: () => unknown, label: string): void {
    try {
        Promise.resolve(callback()).catch((error) => logDebug(`[SB SpeedUp] ${label} error: ` + String(error)));
    } catch (error) {
        logDebug(`[SB SpeedUp] ${label} error: ` + String(error));
    }
}

/** 程序性写倍速：记录时间戳，供调度器忽略由此触发的 ratechange。 */
function setProgrammaticRate(video: HTMLVideoElement, rate: number): void {
    lastEventAt.programmaticRate = performance.now();
    try {
        if (video.playbackRate !== rate) video.playbackRate = rate;
    } catch (error) {
        logDebug("[SB SpeedUp] error: " + String(error));
    }
}

/** 调度器用：最近的 ratechange 是否由本模块写倍速引起（是则跳过全量重排）。 */
export function isRecentProgrammaticRateChange(): boolean {
    // 100ms 窗口：容得下浏览器派发 ratechange 的延迟，又不至于吞掉用户随后的真实改速
    return performance.now() - lastEventAt.programmaticRate < 100;
}

export function isManuallyCancelled(segment: SponsorTime): boolean {
    if (!segment?.UUID) return false;
    const entry = manuallyCancelledMap.get(segment.UUID);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
        // 冷却已过期，惰性清理
        manuallyCancelledMap.delete(segment.UUID);
        return false;
    }
    const current = getVideo()?.currentTime ?? -1;
    // 仍处于被阻止区间内（允许前后 0.3s / 0.5s 的定位误差）
    const [start, end] = entry.range;
    if (current >= start - 0.3 && current < end + 0.5) return true;
    // 已离开区间，解除阻止
    manuallyCancelledMap.delete(segment.UUID);
    return false;
}

export function clearManuallyCancelled(segment: SponsorTime): void {
    if (!segment?.UUID) return;
    manuallyCancelledMap.delete(segment.UUID);
}

/** 快进倍速可用区间：下限保证“快进”确实更快，上限防配置写坏时的极端值（浏览器允许更高但不实用）。 */
function clampSpeedUpRate(rate: number): number {
    return Math.min(16, Math.max(1.1, rate));
}

function parseSpeedUpRate(): number {
    const raw = Config.config.speedUpPlaybackRate;
    const rate = typeof raw === "string" ? parseFloat(raw) : raw;
    if (isNaN(rate) || !isFinite(rate)) return 2;
    return clampSpeedUpRate(rate);
}

/**
 * 快进倍速：当前播放倍速与设置倍速相同时叠加而非原地不动（如当前 2x、设置 2x → 4x，
 * 否则"快进"不比原速快），不同时取较大值保证快进不变慢。
 * 等值判定留 0.05 容差，与外部改速判定同级。
 */
function computeSpeedUpRate(configuredRate: number, currentRate: number): number {
    if (Math.abs(currentRate - configuredRate) <= 0.05) {
        return clampSpeedUpRate(currentRate + configuredRate);
    }
    return clampSpeedUpRate(Math.max(configuredRate, currentRate));
}

export function isSpeedUpActive(): boolean {
    return session !== null;
}

/**
 * 返回快进前的原始倍速（用于调度计算）。
 * 当快进激活时，下一个片段的跳过会在倍速恢复为原始值后进行，
 * 因此调度 delayTime 应使用原始倍速而非当前快进倍速。
 */
export function getSpeedUpOriginalRate(): number {
    return session ? session.originalRate : 1;
}

export function getActiveSpeedUpInfo(): { segments: SponsorTime[]; start: number; end: number; rate: number } | null {
    if (!session) return null;
    return { segments: [...session.segments], start: session.start, end: session.end, rate: session.rate };
}

/** Read-only deadline for the notice, including a video-paused speed-up session. */
export function getSpeedUpNoticeEnd(segments: SponsorTime[]): number | undefined {
    const context = session ?? pausedSession;
    return context && context.segments.some(member => segments.some(segment => segment.UUID === member.UUID))
        ? context.end : undefined;
}

/** 是否已进入“距结尾不足 epsilon”的近尾区：startSpeedUp 据此拒绝启动，skipToTime 据此回退瞬时跳过。 */
export function isNearSpeedUpEnd(currentTime: number, endTime: number): boolean {
    return currentTime >= endTime - COMPLETION_EPSILON;
}

/** 视频时间是否落在片段内（起点留 3ms 容差，抹平 seek 落点与提交数据的取整误差）。 */
function isInsideSegment(segment: SponsorTime, time: number): boolean {
    return segment.segment[0] - skipBuffer <= time && time < segment.segment[1];
}

export function shouldUseSpeedUp(segment: SponsorTime, ignoreManualCancel = false): boolean {
    if (!segment) return false;
    if (Config.config.disableSkipping) return false;
    if (!Config.config.enableSpeedUp) return false;
    if (contentState.channelWhitelisted) return false;
    if (segment.actionType !== ActionType.Skip) return false;
    if (segment.source === 3) { // SponsorSourceType.Danmaku
        if (!Config.config.enableAutoSkipDanmakuSkip) return false;
    }
    // If user manually cancelled this UUID, don't speed up again while still inside segment
    // （ignoreManualCancel 供“段内 seek 恢复倍速”路径使用：先确认可倍速再清除标记）
    if (!ignoreManualCancel && isManuallyCancelled(segment)) {
        return false;
    }
    // Don't speed up very short segments (<0.5s) - not worth it, fallback to skip
    const duration = segment.segment[1] - segment.segment[0];
    if (duration < 0.5) return false;
    return true;
}

/** 回收会话持有的全部资源：轮询、完成定时器与 video 监听（停机路径统一调用）。 */
function releaseSession(active: SpeedUpSession): void {
    if (active.checkInterval) clearInterval(active.checkInterval);
    if (active.completionTimeout) clearTimeout(active.completionTimeout);
    if (active.timeUpdateHandler) {
        active.video.removeEventListener("timeupdate", active.timeUpdateHandler);
        active.video.removeEventListener("seeked", active.timeUpdateHandler);
    }
}

/**
 * 在片段结束前的精确时刻安排完成判定：延迟按当前倍速换算成真实时间。
 * setTimeout 只会晚到不会早到，按剩余墙钟时间精确触发即可越过 epsilon；
 * 最小间隔兜底卡顿/取整，滞后场景由 checkCompletion 自愈重排。
 * 100ms 兜底轮询在高倍速下会以 1.6s+ 的视频时间粒度越过结尾，精确触发依赖此定时器。
 */
function scheduleCompletionCheck(): void {
    const active = session;
    if (!active) return;
    if (active.completionTimeout) {
        clearTimeout(active.completionTimeout);
        active.completionTimeout = null;
    }
    const remainingVideoTime = active.end - COMPLETION_EPSILON - active.video.currentTime;
    // 最小 8ms：防 0ms 定时器链空转，同时把高倍速下越过结尾的过冲压到最低
    const delay = Math.max(8, (remainingVideoTime * 1000) / active.rate);
    active.completionTimeout = setTimeout(() => {
        active.completionTimeout = null;
        void checkCompletion();
    }, delay);
}

function findNestedMuteSegments(start: number, end: number): SponsorTime[] {
    const all = [...contentState.sponsorTimes, ...contentState.sponsorTimesSubmitting];
    return all.filter(
        (s) =>
            s.actionType === ActionType.Mute &&
            (s.hidden === undefined || s.hidden === SponsorHideType.Visible) &&
            s.segment[0] < end &&
            s.segment[1] > start
    );
}

/** 该视频时间点是否落在内嵌 Mute 片段内（20ms 探测窗抹平轮询粒度与片段边界的取整误差）。 */
function isMuteSegmentAt(time: number): boolean {
    return findNestedMuteSegments(time, time + 0.02).length > 0;
}

function applySpeedUpMute(video: HTMLVideoElement): void {
    if (muteState.muted || video.muted) return;
    video.muted = true;
    muteState.muted = true;
}

/** 解除快进静音：只解除本模块自己设的静音，避免误动用户自身的静音状态。 */
function clearSpeedUpMute(video: HTMLVideoElement): void {
    if (!muteState.muted) return;
    video.muted = false;
    muteState.muted = false;
}

/** 静音时间线上此刻是否有活跃窗口（相邻窗口可能无缝衔接，恢复需据此抑制误判）。 */
function isMuteWindowActive(at: number = performance.now()): boolean {
    return muteState.windows.some((w) => at >= w.entryAt && at < w.exitAt);
}

/** 停机时恢复静音：仍处于其他 Mute 片段内则保持静音，但此时交还静音所有权（标记清零）。 */
function restoreSpeedUpMute(video: HTMLVideoElement): void {
    if (muteState.muted && !isMuteSegmentAt(video.currentTime)) clearSpeedUpMute(video);
    muteState.muted = false;
}

function clearMuteTimers(): void {
    for (const timer of muteState.timers) clearTimeout(timer);
    muteState.timers = [];
    muteState.windows = [];
}

/**
 * 为快进区间内的内嵌 Mute 安排精确静音/恢复定时器。
 * 高倍速下轮询粒度（100ms ≈ 1.6s 视频时间@16x）会整段漏掉短静音，
 * 定时器把视频时间差按会话倍速换算成墙钟延迟精确触发；
 * checkCompletion 的轮询保留为漂移/迟到位片段的兜底（以时间线抑制误恢复）。
 */
function scheduleMuteTimers(): void {
    clearMuteTimers();
    const active = session;
    if (!active) return;
    const current = active.video.currentTime;
    const now = performance.now();
    const msUntil = (videoTime: number) => Math.max(0, ((videoTime - current) * 1000) / active.rate);
    muteState.windows = findNestedMuteSegments(current, active.end).map((m) => ({
        entryAt: now + msUntil(m.segment[0]),
        exitAt: now + msUntil(m.segment[1]),
    }));
    for (const w of muteState.windows) {
        muteState.timers.push(setTimeout(() => {
            if (session) applySpeedUpMute(session.video);
        }, Math.max(0, w.entryAt - performance.now())));
        muteState.timers.push(setTimeout(() => {
            if (session && !isMuteWindowActive()) clearSpeedUpMute(session.video);
        }, Math.max(0, w.exitAt - performance.now())));
    }
}

async function checkCompletion(): Promise<void> {
    const active = session;
    if (!active) return;
    const { video } = active;
    const current = video.currentTime;

    // 快进期间的内嵌 Mute：精确定时器是主路径，此处轮询兜底迟到的提交片段；
    // 时间线仍活跃时不得恢复，避免与定时器竞态来回翻转
    if (isMuteSegmentAt(current)) {
        applySpeedUpMute(video);
    } else if (!isMuteWindowActive()) {
        clearSpeedUpMute(video);
    }

    // Completed: reached or passed end
    if (current >= active.end - COMPLETION_EPSILON) {
        logDebug(`[SB SpeedUp] completed segment ${active.start} -> ${active.end} at ${current}`);
        const completedSegments = [...active.segments];
        const completedRate = active.rate;
        const completedEnd = active.end;

        // 先停机恢复再触发副作用，避免重入
        deactivate(true);

        safeCommand(() => getContentApp().commands.execute("skip/recordSkipped", {
            segments: completedSegments,
            rate: completedRate,
        }), "recordSkipped");

        // 关闭对应的手动快进 notice，避免显示时间与实际快进结束后仍残留对不上
        safeCommand(() => getContentApp().commands.execute("skip/closeNoticesForSegments", {
            segments: completedSegments,
        }), "closeNoticesForSegments");

        // Emit completion events for UI (reuse skip executed semantics but as speedUp)
        safeCommand(() => getContentApp().bus.emit(CONTENT_EVENTS.SKIP_EXECUTED, {
            skipTime: [completedSegments[0].segment[0], completedEnd] as [number, number],
            skippingSegments: completedSegments,
            autoSkip: true,
            openNotice: false,
        }, { source: "speedUpManager.checkCompletion" }), "emit SKIP_EXECUTED");

        // 已完成区间在此刻才标记：委托时过早标记会让手动取消后的同段 notice 被抑制。
        // 标记须先于重排，防止完成触发的调度对同一合并体重复弹 notice。
        safeCommand(() => getContentApp().commands.execute("skip/markRangeExecuted", {
            start: completedSegments[0].segment[0],
            end: completedEnd,
        }), "markRangeExecuted");

        // 以 completedEnd 为调度基准：高倍速下完成判定触发时实时 currentTime 可能已越过结尾
        // 零点几秒，用实时时间会把起点落在过冲点之前的紧邻下一段过滤掉（整段漏倍速）；
        // completedEnd 略滞后于实时时间，调度链会自然向前收敛。
        safeCommand(() => getContentApp().commands.execute("skip/startSchedule", { currentTime: completedEnd }), "startSchedule");
        return;
    }

    // 回退到起点前 0.3s 以外、越过结尾 1s 以上、或循环回片头：均视为用户已离开区间。
    // 容差内的抖动（高倍速下的 timeupdate 粒度）不算。
    const leftSegment = current < active.start - 0.3
        || current > active.end + 1
        || (video.loop && current < 0.2 && active.start > 1);
    if (leftSegment) {
        logDebug(`[SB SpeedUp] cancel - current ${current} outside ${active.start} -> ${active.end}`);
        await cancelSpeedUp(true, true);
        return;
    }

    // 定时器可能因 seek/stall 提前失效，自愈重排
    if (session === active && active.completionTimeout === null) {
        scheduleCompletionCheck();
    }
}

/**
 * 停机的唯一路径：完成、取消、外部改倍速、元素替换全部收敛到这里，防止清理逻辑分叉。
 * @param restoreRate 是否恢复为会话记录的原始倍速（外部改倍速等保留用户选择的场景传 false）
 * @param manualSegments 需要写入手动取消冷却的片段
 */
function deactivate(restoreRate: boolean, manualSegments?: SponsorTime[]): void {
    const finished = session;
    // 先清空 session 再恢复倍速：写倍速触发的 ratechange 不应再被本模块当作“快进中”处理
    session = null;
    clearMuteTimers();
    if (finished) releaseSession(finished);
    if (finished && restoreRate) {
        // 恢复必须作用于被改过倍速的元素，而非当前 getVideo()
        setProgrammaticRate(finished.video, finished.originalRate);
        restoreSpeedUpMute(finished.video);
    } else {
        muteState.muted = false;
    }
    if (manualSegments?.length) scheduleManualCancelCooldown(manualSegments);
    notifySpeedUpStateChange();
}
/** 广播快进状态（激活/暂停上下文）给 UI（notice 按钮显隐订阅此事件刷新）。 */
function notifySpeedUpStateChange(): void {
    safeCommand(() => getContentApp().bus.emit(CONTENT_EVENTS.SPEEDUP_STATE_CHANGED, {
        active: session !== null,
        pausedContext: pausedSession !== null,
    }, { source: "speedUpManager" }), "emit SPEEDUP_STATE_CHANGED");
}

export async function startSpeedUp(skippingSegments: SponsorTime[], skipTime: number[], forcedOriginalRate?: number): Promise<boolean> {
    if (!skippingSegments?.length || !skipTime?.length) return false;
    const primary = skippingSegments[0];
    if (!shouldUseSpeedUp(primary)) return false;

    const video = getVideo();
    if (!video) return false;

    // 配置倍速低于用户当前倍速时不降速（“快进”不应变慢）
    const configuredRate = parseSpeedUpRate();
    // 链式启动时 video.playbackRate 是上一段的快进倍速，须以会话记录的原速为基准，
    // 否则叠加规则会翻倍，且结束后把用户原速抬高
    const currentRate = typeof forcedOriginalRate === "number" && isFinite(forcedOriginalRate) && forcedOriginalRate > 0
        ? forcedOriginalRate
        : session?.originalRate ?? video.playbackRate;
    const rate = computeSpeedUpRate(configuredRate, currentRate);

    // If already active for same primary UUID, just update end if needed
    if (session && session.segments[0]?.UUID === primary.UUID) {
        // Update end if merged duration extended
        if (skipTime[1] > session.end) {
            session.end = skipTime[1];
            session.segments = skippingSegments;
            scheduleCompletionCheck();
            scheduleMuteTimers();
        }
        return true;
    }

    // If active for different segment, cancel previous first (await restore)
    if (session) {
        await cancelSpeedUp(true, false, false);
    }

    // 距结尾不足 epsilon 时不启动（isNearSpeedUpEnd），由调用方回退瞬时跳过
    if (isNearSpeedUpEnd(video.currentTime, skipTime[1])) {
        logDebug(`[SB SpeedUp] abort start - already past end ${video.currentTime} >= ${skipTime[1]}`);
        return false;
    }

    // 优先使用调用方传入的原速率（currentRate 在写入快进速率前已捕获）
    session = {
        video,
        segments: skippingSegments,
        start: skipTime[0],
        end: skipTime[1],
        rate,
        originalRate: currentRate,
        checkInterval: null,
        completionTimeout: null,
        timeUpdateHandler: null,
    };
    const active = session;

    logDebug(`[SB SpeedUp] start ${active.start} -> ${active.end} rate=${rate} original=${currentRate}`);

    // 同步设置 video 速率，确保后续 timeupdate 立即以新速率推进
    setProgrammaticRate(video, rate);
    // 起点即在内嵌 Mute 内时立即静音
    if (isMuteSegmentAt(video.currentTime)) applySpeedUpMute(video);

    // 100ms 兜底轮询 + timeupdate/seeked 事件（高倍速下轮询粒度很粗，精确完成由定时器负责）
    active.checkInterval = setInterval(() => void checkCompletion(), 100);
    active.timeUpdateHandler = () => void checkCompletion();
    video.addEventListener("timeupdate", active.timeUpdateHandler);
    video.addEventListener("seeked", active.timeUpdateHandler);
    scheduleMuteTimers();
    scheduleCompletionCheck();
    notifySpeedUpStateChange();

    // 立即检查一次，防止已在结束位置附近
    void checkCompletion();

    return true;
}

export async function cancelSpeedUp(restoreRate = true, isManual = false, reschedule = true): Promise<void> {
    if (!session) return;
    const cancelledSegments = [...session.segments];
    logDebug(`[SB SpeedUp] cancel restore=${restoreRate} manual=${isManual}`);
    deactivate(restoreRate, isManual ? cancelledSegments : undefined);
    // 暂停/内部重启等场景通过 reschedule=false 跳过重排，恢复播放时统一调度
    if (reschedule) {
        if (isManual) {
            // 手动取消：排除当前段（让用户看完），但保留后续段调度
            setTimeout(() => safeCommand(() => getContentApp().commands.execute("skip/startSchedule", {
                includeIntersectingSegments: false,
                currentTime: getVideo()?.currentTime,
                includeNonIntersectingSegments: true,
            }), "manual reschedule"), 200);
        } else {
            // 普通取消：等倍速恢复生效后再全量重排
            setTimeout(() => safeCommand(() => getContentApp().commands.execute("skip/startSchedule", {}), "reschedule"), 150);
        }
    }
}

export function resetSpeedUpState(): void {
    deactivate(session !== null);
    pausedSession = null;
    manuallyCancelledMap.clear();
    lastEventAt.resumeAttempt = -Infinity;
}

/** 供 skipScheduler 在 seek 落点仍在段内时恢复倍速（段内 seek 不再瞬时跳过）。 */
export function tryResumeSpeedUpAt(time: number): boolean {
    const video = getVideo();
    if (!video || video.paused) return false;
    const candidates = [...contentState.sponsorTimes, ...contentState.sponsorTimesSubmitting];
    const seg = candidates.find((s) => s.actionType === ActionType.Skip && isInsideSegment(s, time));
    if (!seg) return false;
    // 先校验可倍速性再清除标记，顺序反了会被 manual-cancel 否决
    if (!shouldUseSpeedUp(seg, true)) return false;
    clearManuallyCancelled(seg);
    void startSpeedUp([seg], [seg.segment[0], seg.segment[1]]);
    return session !== null;
}

export function registerSpeedUpManager(): void {
    const app = getContentApp();

    // Seeking during speedUp：seek 落点仍在同一片段内则保持倍速（仅更新区间），
    // 落到段外才取消。一律 manual-cancel 会让调度器退化为瞬时跳过。
    app.bus.on(CONTENT_EVENTS.PLAYER_SEEKING, ({ video }) => {
        const active = session;
        if (!active) return;
        const t = video.currentTime;
        if (active.segments.some((s) => isInsideSegment(s, t))) {
            logDebug(`[SB SpeedUp] seek inside segment, keep rate at ${t}`);
            scheduleCompletionCheck();
            scheduleMuteTimers();
            return;
        }
        void cancelSpeedUp(true, true);
    });

    app.bus.on(CONTENT_EVENTS.PLAYER_PAUSE, () => {
        const active = session;
        if (!active) return;
        // 暂存上下文并恢复原倍速；PLAY 时若仍在段内则恢复快进（长暂停可恢复）。
        // 不触发重排：否则 150ms 后调度器在暂停期间运行，与恢复路径竞争。
        const { segments, start, end, originalRate } = active;
        pausedSession = { segments: [...segments], start, end, originalRate };
        notifySpeedUpStateChange();
        void cancelSpeedUp(true, false, false);
    });

    const resumeAfterPause = ({ video }: { video: HTMLVideoElement }) => {
        const saved = pausedSession;
        if (session || !saved) return;
        // PLAY 与 PLAYING 通常接连触发，200ms 内视为同一轮，只处理一次
        if (performance.now() - lastEventAt.resumeAttempt < 200) return;
        lastEventAt.resumeAttempt = performance.now();
        pausedSession = null;
        const t = video.currentTime;
        // 落点判定用合并后的 end（而非各段自身终点）：恢复快进时区间可能已被扩展
        const stillInside = saved.segments.some((s) => s.segment[0] - skipBuffer <= t && t < saved.end);
        if (!stillInside || video.paused) return;
        const primary = saved.segments[0];
        if (!shouldUseSpeedUp(primary)) return;
        clearManuallyCancelled(primary);
        void startSpeedUp(saved.segments, [saved.start, saved.end], saved.originalRate);
    };
    app.bus.on(CONTENT_EVENTS.PLAYER_PLAY, resumeAfterPause);
    app.bus.on(CONTENT_EVENTS.PLAYER_PLAYING, resumeAfterPause);

    app.bus.on(CONTENT_EVENTS.PLAYER_RATE_CHANGED, ({ playbackRate }) => {
        const active = session;
        if (!active) return;
        // If rate changed externally and not equal to our target, user manually changed rate
        // 偏差超过 0.12 才算外部改速（B 站倍速步进最小 0.25，容差覆盖同值反复写入）
        if (Math.abs(playbackRate - active.rate) > 0.12) {
            logDebug(`[SB SpeedUp] external rate change ${playbackRate} != ${active.rate} -> cancel without restore`);
            // User changed rate manually; cancel but don't restore (keep user's choice).
            // 冷却期阻止同段立即再次快进；下次快进以 video.playbackRate（用户新速率）为恢复基准
            deactivate(false, [...active.segments]);
        }
    });

    app.bus.on(CONTENT_EVENTS.VIDEO_RESET_REQUESTED, () => {
        resetSpeedUpState();
    });

    app.bus.on(CONTENT_EVENTS.VIDEO_ELEMENT_CHANGED, () => {
        resetSpeedUpState();
    });

    app.bus.on(CONTENT_EVENTS.CONFIG_CHANGED, ({ changes }) => {
        const c = changes as unknown as Record<string, unknown>;
        const active = session;
        if (!active) return;
        if (c["enableSpeedUp"] !== undefined && !Config.config.enableSpeedUp) return void cancelSpeedUp(true, false);
        if (c["disableSkipping"] !== undefined && Config.config.disableSkipping) return void cancelSpeedUp(true, false);
        // 倍速配置改动：就地更新会话速率，不必重启快进
        if (c["speedUpPlaybackRate"] === undefined) return;
        // 就地更新会话速率，不必重启快进；叠加规则以会话记录的原始倍速为基准
        const newRate = computeSpeedUpRate(parseSpeedUpRate(), active.originalRate);
        if (Math.abs(newRate - active.rate) <= 0.05) return;
        active.rate = newRate;
        setProgrammaticRate(active.video, newRate);
        scheduleCompletionCheck();
        scheduleMuteTimers();
    });

    app.bus.on(CONTENT_EVENTS.CHANNEL_WHITELIST_CHANGED, ({ whitelisted }) => {
        if (whitelisted && session) {
            void cancelSpeedUp(true, false);
        }
    });
}

/** 手动取消的 UUID 在冷却期内记录区间；过期由 isManuallyCancelled 惰性清理，无需定时器。 */
function scheduleManualCancelCooldown(segments: SponsorTime[]): void {
    for (const seg of segments) {
        manuallyCancelledMap.set(seg.UUID, {
            range: [...seg.segment] as [number, number],
            // 5s 冷却：足够用户看完被取消的片段，又不至于让同段永久失去快进
            expiresAt: Date.now() + 5000,
        });
    }
}
