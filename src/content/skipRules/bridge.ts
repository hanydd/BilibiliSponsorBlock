import type { SponsorTime } from '../../types';
import type { RuleEvent } from './types';

export type EngineMode = 'legacy' | 'shadow' | 'rules';
export interface RuleRuntime {
    mode: EngineMode;
    observe(): void;
    action(event: RuleEvent): void;
    preview(time: number, unpause: boolean, id?: string): void;
    setEditing(open: boolean): void;
    speedInfo(): { segments: SponsorTime[]; start: number; end: number; rate: number } | null;
    deadline(segments: SponsorTime[]): number | undefined;
    originalRate(): number;
    isExcluded(id: string): boolean;
    reset(): void;
}
let runtime: RuleRuntime | undefined;
export function installRuleRuntime(value: RuleRuntime): void { runtime = value; }
export function getRuleRuntime(): RuleRuntime | undefined { return runtime; }
export function isRuleEngineEnabled(): boolean { return runtime?.mode === 'rules'; }
