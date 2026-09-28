/** Rule inputs contain values only: no Config, DOM, timers or network. */
export type Policy = 'auto' | 'manual' | 'mark' | 'ignore';
export type SegmentAction = 'skip' | 'mute' | 'poi' | 'full';
export interface PolicySettings {
    autoSkipOnMusicVideos: boolean;
    manualSkipOnFullVideo: boolean;
    muteSegments: boolean;
    minDuration?: number;
}
export interface VideoPolicyFacts {
    hasMusic: boolean;
    fullVideoCategories: readonly string[];
}
export interface RuleSegment {
    id: string;
    start: number;
    end: number;
    action: SegmentAction;
    policy: Policy;
    category?: string;
    hidden?: boolean;
    externalSource?: boolean;
    draft?: boolean;
    policyTrace?: readonly RuleTrace[];
}
export type CardPhase = 'preview' | 'pending' | 'speeding' | 'speed-paused' | 'muted' | 'completed';
export type RuleCardClock = { kind: 'media'; boundary: 'start' | 'end'; deadline: number } | { kind: 'display' };
export interface RuleCard {
    show: boolean;
    clock: RuleCardClock;
    visit: number;
    phase: CardPhase;
    deadline?: number;
    automatic?: boolean;
}
export interface Visit {
    number: number;
    inside: boolean;
    entered: boolean;
    auto: boolean;
    manual?: 'mute' | 'speed';
    resumeFrom?: 'pending' | 'speed' | 'explicit';
    excluded?: 'dismiss' | 'cancel' | 'undo' | 'pause-speed' | 'user-rate';
    /** An explicit action on this visit can override protection from another segment. */
    overlapOverride?: boolean;
    phase?: CardPhase;
    start: number;
    end: number;
}
export interface RuleState {
    time?: number;
    visits: Record<string, Visit>;
    /** User-created review scopes, keyed by the segment being reviewed. */
    reviews?: Record<string, { action: 'skip' | 'mute' }>;
}
export type RuleEvent =
    | { kind: 'time' | 'seek' | 'resume' | 'data' | 'pause' | 'handoff' | 'edit-end' }
    | { kind: 'dismiss' | 'undo' | 'skip' | 'pause-speed' | 'resume-speed' | 'allow' | 'deny'; id: string; forceSeek?: boolean }
    | { kind: 'applied' | 'user-rate'; ids: string[] };
export interface RuleInput {
    policySettings?: PolicySettings;
    videoFacts?: VideoPolicyFacts;
    time: number;
    paused: boolean;
    waiting: boolean;
    disabled: boolean;
    speedUp: boolean;
    skipOnEntry: boolean;
    resumeAction?: 'continue' | 'manual';
    speedUpResumeAction?: 'continue' | 'manual';
    previewLead: number;
    showNotices?: boolean;
    editing: boolean;
    includeOtherSegments: boolean;
    previewId?: string;
    segments: readonly RuleSegment[];
}
export interface RuleTrace { id: string; rule: string; result: string; relatedIds?: readonly string[] }
export interface RulePlan {
    state: RuleState;
    cards: Record<string, RuleCard>;
    seek?: { time: number; ids: string[]; reason: 'skip' | 'undo' };
    poi?: string;
    speed: string[];
    mute: string[];
    /** Derived for this evaluation, never copied into another segment's own intent. */
    protectedBy: Record<string, readonly string[]>;
    trace: RuleTrace[];
}
export function emptyRuleState(): RuleState { return { visits: {} }; }
export function contains(segment: Pick<RuleSegment, 'start' | 'end'>, time: number): boolean {
    return time >= segment.start && time < segment.end;
}
