/** Rule inputs contain values only: no Config, DOM, timers or network. */
export type Policy = 'auto' | 'manual' | 'mark' | 'ignore';
export type SegmentAction = 'skip' | 'mute' | 'poi' | 'full';
export interface RuleSegment {
    id: string;
    start: number;
    end: number;
    action: SegmentAction;
    policy: Policy;
    draft?: boolean;
}
export type CardPhase = 'preview' | 'pending' | 'speeding' | 'speed-paused' | 'muted' | 'completed';
export interface RuleCard {
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
    excluded?: 'dismiss' | 'undo' | 'pause-speed';
    phase?: CardPhase;
    start: number;
    end: number;
}
export interface RuleState {
    time?: number;
    visits: Record<string, Visit>;
}
export type RuleEvent =
    | { kind: 'time' | 'seek' | 'resume' | 'data' | 'pause' | 'handoff' | 'edit-end' }
    | { kind: 'dismiss' | 'undo' | 'skip' | 'pause-speed' | 'resume-speed' | 'allow' | 'deny'; id: string; forceSeek?: boolean }
    | { kind: 'applied'; ids: string[] };
export interface RuleInput {
    time: number;
    paused: boolean;
    waiting: boolean;
    disabled: boolean;
    speedUp: boolean;
    skipOnEntry: boolean;
    previewLead: number;
    editing: boolean;
    includeOtherSegments: boolean;
    previewId?: string;
    segments: readonly RuleSegment[];
}
export interface RuleTrace { id: string; rule: string; result: string }
export interface RulePlan {
    state: RuleState;
    cards: Record<string, RuleCard>;
    seek?: { time: number; ids: string[]; reason: 'skip' | 'undo' };
    poi?: string;
    speed: string[];
    mute: string[];
    trace: RuleTrace[];
}
export function emptyRuleState(): RuleState { return { visits: {} }; }
export function contains(segment: Pick<RuleSegment, 'start' | 'end'>, time: number): boolean {
    return time >= segment.start && time < segment.end;
}
