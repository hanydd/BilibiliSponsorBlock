import Config from '../../config';
import Utils from '../../utils';
import { getChannelIDInfo, getCid, getVideo, getVideoID } from '../../utils/video';
import { logDebug } from '../../utils/logger';
import { ActionType, CategorySkipOption, ChannelIDStatus, SponsorSourceType, SponsorTime } from '../../types';
import { getContentApp } from '../app';
import { CONTENT_EVENTS } from '../app/events';
import { contentState } from '../state';
import { seekForSkip } from '../skipSeek';
import { EngineMode, installRuleRuntime, RuleRuntime } from './bridge';
import { evaluateRules } from './engine';
import { emptyRuleState, Policy, RuleEvent, RuleInput, RulePlan, RuleSegment, RuleState } from './types';

interface RuntimePorts {
    stopLegacy: () => void;
    record: (segments: SponsorTime[], saved: number) => void;
}

/** The only side-effect owner in rules mode. The same evaluator is read-only in shadow mode. */
export class SkipRulesRuntime implements RuleRuntime {
    mode: EngineMode = 'legacy';
    private selected = false;
    private failed = false;
    private video?: HTMLVideoElement;
    private identity = '';
    private state: RuleState = emptyRuleState();
    private plan?: RulePlan;
    private timer?: ReturnType<typeof setTimeout>;
    private disposeVideo?: () => void;
    private waiting = false;
    private editing = false;
    private previewId?: string;
    private ownedSeek?: number;
    private rate?: { original: number; target: number };
    private muted?: { original: boolean };
    private published = new Map<string, string>();
    private poiId?: string;
    private previousTrace = '';
    private savings = 0;
    private utils = new Utils();

    constructor(private ports: RuntimePorts) {}

    attach(): void {
        if (!Config.isReady()) return;
        if (!this.selected) {
            this.selected = true;
            const configured = Config.config.skipEngineMode;
            if (configured === 'rules') this.ports.stopLegacy();
            this.mode = configured === 'rules' || configured === 'shadow' ? configured : 'legacy';
        }
        if (this.mode === 'legacy') return;
        const video = getVideo();
        const identity = `${getVideoID()}:${getCid()}`;
        if (video === this.video && identity === this.identity) return;
        const retained = identity === this.identity ? this.state : emptyRuleState();
        this.reset();
        this.state = retained;
        this.identity = identity;
        this.video = video;
        if (!video) return;
        const listeners: Array<[string, EventListener]> = [];
        const on = (name: string, fn: () => void) => { video.addEventListener(name, fn); listeners.push([name, fn]); };
        on('seeking', () => {
            if (this.ownedSeek !== undefined && Math.abs(video.currentTime - this.ownedSeek) < 0.25) return;
            this.ownedSeek = undefined;
            this.run({ kind: 'seek' });
        });
        on('seeked', () => { this.ownedSeek = undefined; this.waiting = false; this.run({ kind: 'time' }); });
        on('timeupdate', () => this.run({ kind: 'time' }));
        on('pause', () => this.run({ kind: 'pause' }));
        on('waiting', () => { this.waiting = true; this.run({ kind: 'pause' }); });
        on('playing', () => { this.waiting = false; this.run({ kind: 'resume' }); });
        on('ratechange', () => {
            if (this.mode !== 'rules' || !this.rate || video.playbackRate === this.rate.target) return;
            this.rate = undefined; // The user's new rate becomes the next baseline.
            for (const [id, card] of Object.entries(this.plan?.cards ?? {})) {
                if (card.phase === 'speeding') this.action({ kind: 'pause-speed', id });
            }
        });
        on('volumechange', () => {
            if (this.mode !== 'rules' || !this.muted || video.muted) return;
            this.muted = undefined;
            for (const [id, card] of Object.entries(this.plan?.cards ?? {})) {
                if (card.phase === 'muted') this.action({ kind: 'deny', id });
            }
        });
        this.disposeVideo = () => listeners.forEach(([name, fn]) => video.removeEventListener(name, fn));
        this.run({ kind: 'data' });
    }

    private segments(): SponsorTime[] { return [...contentState.sponsorTimes, ...contentState.sponsorTimesSubmitting]; }

    private snapshot(): RuleInput {
        const all = this.segments();
        const full = new Set(all.filter(s => s.actionType === ActionType.Full).map(s => s.category));
        const segments: RuleSegment[] = all.map(s => {
            let option = this.utils.getCategorySelection(s.category)?.option ?? CategorySkipOption.Disabled;
            if (s.source === SponsorSourceType.Danmaku) option = !Config.config.enableDanmakuSkip ? CategorySkipOption.Disabled :
                Config.config.enableAutoSkipDanmakuSkip ? CategorySkipOption.AutoSkip : CategorySkipOption.ManualSkip;
            if (Config.config.autoSkipOnMusicVideos && all.some(s => s.category === 'music_offtopic') && s.actionType === ActionType.Skip && option !== CategorySkipOption.Disabled) option = CategorySkipOption.AutoSkip;
            if (Config.config.manualSkipOnFullVideo && full.has(s.category) && option === CategorySkipOption.AutoSkip) option = CategorySkipOption.ManualSkip;
            const policies: Record<number, Policy> = { [-1]: 'ignore', 0: 'mark', 1: 'manual', 2: 'auto' };
            const policy = s.hidden !== undefined || s.source === SponsorSourceType.YouTube ||
                (s.actionType === ActionType.Mute && !Config.config.muteSegments) ? 'ignore' : policies[option] ?? 'ignore';
            return { id: s.UUID, start: s.segment[0], end: Math.min(s.segment[1], this.video.duration || Infinity),
                action: s.actionType, policy, draft: contentState.sponsorTimesSubmitting.some(d => d.UUID === s.UUID) };
        });
        return {
            time: this.video.currentTime, paused: this.video.paused, waiting: this.waiting,
            disabled: Config.config.disableSkipping || contentState.channelWhitelisted ||
                (Config.config.forceChannelCheck && getChannelIDInfo().status === ChannelIDStatus.Fetching),
            speedUp: Config.config.enableSpeedUp, skipOnEntry: Config.config.skipOnSeekToSegment,
            previewLead: Config.config.advanceSkipNotice ? Config.config.skipNoticeDurationBefore : 0,
            editing: this.editing, includeOtherSegments: Config.config.previewIncludeOtherSegments,
            previewId: this.previewId, segments,
        };
    }

    observe(): void { this.attach(); this.run({ kind: 'data' }); }
    action(event: RuleEvent): void { if (this.mode === 'rules') this.run(event); }
    setEditing(open: boolean): void {
        const endingIsolatedEdit = this.editing && !open && !Config.config.previewIncludeOtherSegments;
        this.editing = open;
        this.previewId = undefined;
        if (endingIsolatedEdit) this.run({ kind: 'edit-end' });
        else this.observe();
    }
    preview(time: number, unpause: boolean, id?: string): void {
        if (!this.video || this.mode !== 'rules') return;
        this.previewId = unpause ? id : undefined;
        this.ownedSeek = Math.max(0, time);
        seekForSkip(this.video, this.ownedSeek);
        this.run({ kind: 'seek' });
        if (unpause && this.video.paused) void this.video.play().catch(() => undefined);
    }

    private run(event: RuleEvent): void {
        if (!this.video || this.mode === 'legacy' || this.failed) return;
        if (getVideo() !== this.video || `${getVideoID()}:${getCid()}` !== this.identity) { this.attach(); return; }
        clearTimeout(this.timer);
        try {
            const input = this.snapshot();
            const prior = this.plan;
            if (this.mode === 'rules' && this.rate && event.kind === 'time' && !input.paused && !input.waiting && this.state.time !== undefined) {
                const end = Math.max(...(prior?.speed ?? []).map(id => prior.state.visits[id].end));
                const elapsed = Math.max(0, Math.min(input.time, end) - this.state.time);
                this.savings += elapsed * Math.max(0, 1 / this.rate.original - 1 / this.rate.target);
            }
            const plan = evaluateRules(this.state, input, event);
            this.state = plan.state;
            this.plan = plan;
            const trace = JSON.stringify({ mode: this.mode, decisions: plan.trace, seek: plan.seek, speed: plan.speed, mute: plan.mute });
            if (trace !== this.previousTrace) { this.previousTrace = trace; logDebug(`[SB Rules] ${trace}`); }
            if (this.mode === 'rules') {
                this.applyPlayback(plan, input);
                this.publish(plan);
                const completed = Object.entries(plan.cards).filter(([id, card]) => card.phase === 'completed' &&
                    (prior?.cards[id]?.phase !== 'completed' || prior.cards[id].visit !== card.visit)).map(([id]) => id);
                if (completed.length && this.savings > 0) {
                    this.ports.record(this.segments().filter(s => completed.includes(s.UUID)), this.savings);
                    this.savings = 0;
                }
                if (plan.seek) {
                    const target = plan.seek.time;
                    const from = this.video.currentTime;
                    const original = this.originalRate();
                    this.ownedSeek = target;
                    seekForSkip(this.video, target);
                    if (Math.abs(this.video.currentTime - target) < 0.25) {
                        if (plan.seek.reason === 'skip') {
                            this.ports.record(this.segments().filter(s => plan.seek.ids.includes(s.UUID)), Math.max(0, target - from) / original);
                            this.run({ kind: 'applied', ids: plan.seek.ids });
                        } else this.run({ kind: 'handoff' });
                        return;
                    }
                }
            }
            const boundaries = input.segments.flatMap(s => [s.start, s.end]).filter(t => t > input.time);
            const next = Math.min(...boundaries);
            const delay = input.paused || input.waiting ? 100 : Math.max(8, Math.min(100, (next - input.time) * 1000 / this.video.playbackRate));
            this.timer = setTimeout(() => this.run({ kind: 'time' }), delay);
        } catch (error) {
            // A failed new engine is stopped, never followed by an immediate old-engine retry.
            logDebug(`[SB Rules] stopped: ${String(error)}`);
            this.failed = true;
            this.restore();
            clearTimeout(this.timer);
        }
    }

    private applyPlayback(plan: RulePlan, input: RuleInput): void {
        if (input.paused || input.waiting) return;
        if (plan.speed.length) {
            const original = this.rate?.original ?? this.video.playbackRate;
            const configured = Math.min(16, Math.max(1.1, Number(Config.config.speedUpPlaybackRate) || 2));
            const target = Math.min(16, Math.abs(configured - original) <= 0.05 ? original + configured : Math.max(configured, original));
            this.rate = { original, target };
            if (this.video.playbackRate !== target) this.video.playbackRate = target;
        } else this.restoreRate();
        if (plan.mute.length) {
            if (!this.muted) this.muted = { original: this.video.muted };
            if (!this.video.muted) this.video.muted = true;
        } else this.restoreMute();
    }

    private publish(plan: RulePlan): void {
        const app = getContentApp();
        const segments = this.segments();
        if (this.poiId !== plan.poi) {
            this.poiId = plan.poi;
            app.bus.emit(CONTENT_EVENTS.SKIP_BUTTON_STATE_CHANGED, {
                enabled: !!plan.poi, segment: segments.find(s => s.UUID === plan.poi) ?? null,
            }, { source: 'skipRules' });
        }
        for (const notice of [...contentState.skipNotices]) {
            if (!notice.props.ruleCard) continue;
            const id = notice.segments[0].UUID;
            if (!plan.cards[id]) notice.close();
        }
        for (const [id, card] of Object.entries(plan.cards)) {
            const key = JSON.stringify(card);
            if (this.published.get(id) === key) continue;
            this.published.set(id, key);
            const segment = segments.find(s => s.UUID === id);
            if (!segment) continue;
            app.bus.emit(CONTENT_EVENTS.SKIP_NOTICE_REQUESTED, {
                noticeKind: card.phase === 'preview' ? 'advance' : 'skip', skippingSegments: [segment],
                autoSkip: card.phase === 'completed' || card.phase === 'muted' || (card.phase === 'preview' && card.automatic), startReskip: false, ruleCard: card,
            }, { source: 'skipRules' });
        }
        for (const id of this.published.keys()) if (!plan.cards[id]) this.published.delete(id);
        app.bus.emit(CONTENT_EVENTS.SPEEDUP_STATE_CHANGED, { active: !!plan.speed.length, pausedContext: !!this.rate && this.video.paused }, { source: 'skipRules' });
    }

    speedInfo(): ReturnType<RuleRuntime['speedInfo']> {
        const ids = this.plan?.speed ?? [];
        const segments = this.segments().filter(s => ids.includes(s.UUID));
        return segments.length ? { segments, start: Math.min(...segments.map(s => s.segment[0])), end: Math.max(...segments.map(s => s.segment[1])), rate: this.video.playbackRate } : null;
    }
    deadline(segments: SponsorTime[]): number | undefined {
        return this.plan?.cards[segments[0]?.UUID]?.deadline;
    }
    isExcluded(id: string): boolean { return this.state.visits[id]?.excluded === "dismiss"; }
    originalRate(): number { return this.rate?.original ?? this.video?.playbackRate ?? 1; }
    private restoreRate(): void {
        const rate = this.rate; this.rate = undefined;
        if (rate && this.video && this.video.playbackRate === rate.target) this.video.playbackRate = rate.original;
    }
    private restoreMute(): void {
        const mute = this.muted; this.muted = undefined;
        if (mute && this.video?.muted) this.video.muted = mute.original;
    }
    private restore(): void { this.restoreRate(); this.restoreMute(); }
    reset(): void {
        clearTimeout(this.timer); this.disposeVideo?.(); this.disposeVideo = undefined;
        if (this.mode === 'rules') this.restore();
        this.video = undefined; this.state = emptyRuleState(); this.plan = undefined;
        this.published.clear(); this.poiId = undefined; this.previewId = undefined; this.ownedSeek = undefined;
        this.failed = false; this.waiting = false; this.savings = 0; this.previousTrace = '';
    }
}

export function registerSkipRules(ports: RuntimePorts): void {
    const runtime = new SkipRulesRuntime(ports);
    installRuleRuntime(runtime);
    const app = getContentApp();
    app.bus.on(CONTENT_EVENTS.VIDEO_RESET_REQUESTED, () => runtime.reset());
    app.bus.on(CONTENT_EVENTS.SEGMENTS_LOADED, () => runtime.observe());
    app.bus.on(CONTENT_EVENTS.SEGMENTS_SUBMITTING_CHANGED, () => runtime.observe());
    app.bus.on(CONTENT_EVENTS.SEGMENT_UPDATED, () => runtime.observe());
    app.bus.on(CONTENT_EVENTS.CONFIG_CHANGED, () => runtime.observe());
    app.bus.on(CONTENT_EVENTS.CHANNEL_WHITELIST_CHANGED, () => runtime.observe());
    app.bus.on(CONTENT_EVENTS.VIDEO_ELEMENT_CHANGED, () => runtime.attach());
    // Detection only; actual rule deadlines use video time and a single owned timer.
    setInterval(() => runtime.attach(), 250);
}
