import { RuleInput, RuleSegment, Visit } from './types';

/** Stable IDs are used by tests and the local decision trace. Order is explicit. */
export const RULES = {
    invalid: 'POLICY-INVALID',
    excluded: 'USER-EXCLUDED',
    editing: 'EDIT-TARGET',
    draft: 'EDIT-PREVIEW',
    disabled: 'POLICY-DISABLED',
    automatic: 'POLICY-AUTO',
    manual: 'POLICY-MANUAL',
    enter: 'ENTER-OUTSIDE-IN',
    within: 'ENTER-INSIDE-IN',
    paused: 'PLAY-PAUSED',
    explicit: 'USER-EXPLICIT',
    merged: 'PLAN-MERGED',
} as const;

export function eligibility(segment: RuleSegment, visit: Visit, input: RuleInput): { rule: string; show: boolean; automatic: boolean } {
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.end <= segment.start ||
        segment.action === 'full' || segment.action === 'poi') {
        return { rule: RULES.invalid, show: false, automatic: false };
    }
    if (visit.excluded === 'dismiss') return { rule: RULES.excluded, show: false, automatic: false };
    if (input.disabled) return { rule: RULES.disabled, show: false, automatic: false };
    if (input.editing && !input.includeOtherSegments && input.previewId !== segment.id) {
        return { rule: RULES.editing, show: false, automatic: false };
    }
    if (segment.draft && input.previewId !== segment.id) return { rule: RULES.draft, show: false, automatic: false };
    // An explicitly selected draft preview is independent of its category setting.
    const policy = input.previewId === segment.id ? 'auto' : segment.policy;
    if (policy === 'ignore' || policy === 'mark') return { rule: RULES.disabled, show: false, automatic: false };
    if (visit.excluded || !visit.auto || (policy === 'manual' && !visit.manual)) return { rule: RULES.manual, show: true, automatic: false };
    return { rule: RULES.automatic, show: true, automatic: true };
}
