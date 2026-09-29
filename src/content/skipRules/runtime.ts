import Config from '../../config';
import Utils from '../../utils';
import { getChannelIDInfo, getCid, getVideo, getVideoID } from '../../utils/video';
import { logDebug } from '../../utils/logger';
import { CategorySkipOption, ChannelIDStatus, SponsorHideType, SponsorSourceType, SponsorTime } from '../../types';
import { getContentApp } from '../app';
import { CONTENT_EVENTS } from '../app/events';
import { contentState } from '../state';
import { seekForSkip } from '../skipSeek';
import { notifyAutomaticSkip } from '../skipNotification';
import { EngineMode, installRuleRuntime, RuleRuntime } from './bridge';
import { evaluateRules } from './engine';
import { transitionPlayback } from './playback';
import { primaryAction } from './intents';
import { NoticeClock } from '../../notices/NoticeClock';
import { policyPreferences, rulePreferences } from './preferences';
import { emptyRuleState, Policy, RuleCard, RuleEvent, RuleInput, RulePlan, RuleSegment, RuleState } from './types';

interface RuntimePorts {
    stopLegacy: () => void;
    startLegacy: () => void;
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
    private published = new Map<string, { card: RuleCard; clock?: NoticeClock }>();
    private poiId?: string;
    private previousTrace = '';
    private savings = 0;
    private utils = new Utils();

    constructor(private ports: RuntimePorts) {}

    attach(): void {
        if (!Config.isReady()) return;
        const configured = Config.config.skipEngineMode;
        const nextMode = configured === 'rules' || configured === 'shadow' ? configured : 'legacy';
        if (!this.selected || this.mode !== nextMode) {
            const wasRules = this.mode === 'rules';
            if (this.selected) this.reset();
            this.selected = true;
            this.mode = nextMode;
            if (wasRules || nextMode === 'rules') {
                // Release timers, playback ownership and old cards before the next engine runs.
                this.ports.stopLegacy();
                for (const notice of [...contentState.skipNotices]) notice.close();
                getContentApp().bus.emit(CONTENT_EVENTS.SKIP_BUTTON_STATE_CHANGED, { enabled: false, segment: null }, { source: 'skipRules.switch' });
                if (nextMode !== 'rules') this.ports.startLegacy();
            }
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
            for (const entry of this.published.values()) entry.clock?.reset(0);
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
            const ids = Object.entries(this.state.visits).filter(([, visit]) => visit.phase === 'speeding').map(([id]) => id);
            this.action({ kind: 'user-rate', ids });
        });
        on('volumechange', () => {
            if (this.mode !== 'rules' || !this.muted || video.muted) return;
            this.muted = undefined;
            for (const [id, visit] of Object.entries(this.state.visits)) {
                if (visit.phase === 'muted') this.action({ kind: 'deny', id });
            }
        });
        this.disposeVideo = () => listeners.forEach(([name, fn]) => video.removeEventListener(name, fn));
        this.run({ kind: 'data' });
    }

    private segments(): SponsorTime[] {
        const segments = new Map((contentState.rawSegments ?? []).map(segment => [segment.UUID, segment]));
        // Local edits and user visibility choices override matching server candidates.
        for (const segment of [...contentState.sponsorTimes, ...contentState.sponsorTimesSubmitting]) segments.set(segment.UUID, segment);
        return [...segments.values()];
    }

    private snapshot(): RuleInput {
        const all = this.segments();
        const segments: RuleSegment[] = all.map(s => {
            let option = this.utils.getCategorySelection(s.category)?.option ?? CategorySkipOption.Disabled;
            // Retain existing danmaku compatibility outside the interval rule model.
            if (s.source === SponsorSourceType.Danmaku) option = !Config.config.enableDanmakuSkip ? CategorySkipOption.Disabled :
                Config.config.enableAutoSkipDanmakuSkip ? CategorySkipOption.AutoSkip : CategorySkipOption.ManualSkip;
            const policies: Record<number, Policy> = { [-1]: 'ignore', 0: 'mark', 1: 'manual', 2: 'auto' };
            return { id: s.UUID, start: s.segment[0], end: Math.min(s.segment[1], this.video.duration || Infinity),
                action: s.actionType, category: s.category, policy: policies[option] ?? 'ignore',
                hidden: s.hidden !== undefined && s.hidden !== SponsorHideType.MinimumDuration,
                externalSource: s.source === SponsorSourceType.YouTube,
                draft: contentState.sponsorTimesSubmitting.some(d => d.UUID === s.UUID) };
        });
        return {
            policySettings: policyPreferences(Config.config),
            time: this.video.currentTime, paused: this.video.paused, waiting: this.waiting,
            disabled: Config.config.disableSkipping || contentState.channelWhitelisted ||
                (Config.config.forceChannelCheck && getChannelIDInfo().status === ChannelIDStatus.Fetching),
            ...rulePreferences(Config.config),
            editing: this.editing,
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
                const startedSpeed = plan.speed.some(id => !input.segments.find(s => s.id === id)?.draft &&
                    (prior?.state.visits[id]?.phase !== 'speeding' || prior.state.visits[id].number !== plan.state.visits[id].number));
                if (startedSpeed) notifyAutomaticSkip(this.video);
                this.publish(plan);
                const completed = Object.entries(plan.state.visits).filter(([id, visit]) => visit.phase === 'completed' &&
                    (prior?.state.visits[id]?.phase !== 'completed' || prior.state.visits[id].number !== visit.number)).map(([id]) => id);
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
                            if (event.kind !== 'skip' && plan.seek.ids.some(id => !input.segments.find(s => s.id === id)?.draft)) notifyAutomaticSkip(this.video);
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

    private applyPlayback(plan: Pick<RulePlan, 'state' | 'speed' | 'mute'>, input: Pick<RuleInput, 'paused' | 'waiting'>): void {
        if (!this.video) return;
        const next = transitionPlayback({ rate: this.video.playbackRate, muted: this.video.muted, speed: this.rate, mute: this.muted },
            plan, input, Config.config.speedUpPlaybackRate);
        // Assign ownership before DOM writes can dispatch rate/volume events.
        this.rate = next.speed; this.muted = next.mute;
        if (this.video.playbackRate !== next.rate) this.video.playbackRate = next.rate;
        if (this.video.muted !== next.muted) this.video.muted = next.muted;
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
            if (!plan.cards[id]?.show) notice.close();
        }
        for (const [id, card] of Object.entries(plan.cards)) {
            const previous = this.published.get(id);
            if (JSON.stringify(previous?.card) === JSON.stringify(card)) continue;
            const clock = card.phase !== 'completed' ? undefined :
                previous?.card.phase === card.phase && previous.card.visit === card.visit ? previous.clock : new NoticeClock(Config.config.skipNoticeDuration * 1000);
            this.published.delete(id);
            this.published.set(id, { card, clock });
            if (!card.show) continue;
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

    /** Without a card, target the latest live interaction; completion expires in display time. */
    toggleSkip(id?: string, forceSeek = false): boolean {
        if (this.mode !== 'rules' || this.failed || !this.video) return false;
        if (id === undefined) {
            if (!Config.config.dontShowNotice) return false;
            id = [...this.published].reverse().find(([, entry]) => !entry.clock || entry.clock.read() > 0)?.[0];
        }
        const visit = this.state.visits[id];
        if (!visit?.phase) return false;
        this.action(primaryAction(id, visit, forceSeek));
        return true;
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
    private restore(): void { this.applyPlayback({ state: emptyRuleState(), speed: [], mute: [] }, { paused: false, waiting: false }); }
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
