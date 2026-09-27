import type Config from '../../config';
import { RuleInput, RuleSegment, Visit } from './types';

/** IDs describe individual decisions; settings change inputs, never rule precedence. */
export const RULES = {
    music: 'SOURCE-MUSIC', fullVideo: 'SOURCE-FULL-VIDEO', source: 'SOURCE-EXCLUDED',
    short: 'POLICY-SHORT', muteDisabled: 'POLICY-MUTE-DISABLED',
    invalid: 'POLICY-INVALID', excluded: 'USER-EXCLUDED', editing: 'EDIT-TARGET', draft: 'EDIT-PREVIEW',
    disabled: 'POLICY-DISABLED', cancelled: 'USER-CANCELLED', visitManual: 'VISIT-MANUAL', automatic: 'POLICY-AUTO', manual: 'POLICY-MANUAL',
    enter: 'ENTER-OUTSIDE-IN', within: 'ENTER-INSIDE-IN', leave: 'EXIT-SEGMENT',
    resumeEntry: 'RESUME-ENTRY', resumeSpeed: 'RESUME-SPEED', paused: 'PLAY-PAUSED', explicit: 'USER-EXPLICIT', userRate: 'USER-RATE',
    overlap: 'UNDO-OVERLAP', applied: 'EXEC-APPLIED', merged: 'PLAN-MERGED', point: 'PLAN-POINT',
    seek: 'METHOD-SEEK', speed: 'METHOD-SPEED', mute: 'METHOD-MUTE',
    preview: 'CARD-PREVIEW', media: 'CARD-MEDIA', display: 'CARD-DISPLAY', hidden: 'CARD-HIDDEN',
} as const;
export type RuleId = typeof RULES[keyof typeof RULES];
type Setting = keyof typeof Config.config;
interface RuleDefinition { stage: 'eligibility' | 'visit' | 'intent' | 'playback' | 'card'; settings: readonly Setting[] }

/** Setting names are checked against the real extension config. Empty means a fixed contract. */
export const ruleDefinitions: Record<RuleId, RuleDefinition> = {
    [RULES.music]: { stage: 'eligibility', settings: ['autoSkipOnMusicVideos'] },
    [RULES.fullVideo]: { stage: 'eligibility', settings: ['manualSkipOnFullVideo'] },
    [RULES.source]: { stage: 'eligibility', settings: [] },
    [RULES.short]: { stage: 'eligibility', settings: ['minDuration'] },
    [RULES.muteDisabled]: { stage: 'eligibility', settings: ['muteSegments'] },
    [RULES.invalid]: { stage: 'eligibility', settings: [] },
    [RULES.excluded]: { stage: 'eligibility', settings: [] },
    [RULES.editing]: { stage: 'eligibility', settings: ['previewIncludeOtherSegments'] },
    [RULES.draft]: { stage: 'eligibility', settings: [] },
    [RULES.disabled]: { stage: 'eligibility', settings: ['disableSkipping', 'categorySelections', 'whitelistedChannels', 'forceChannelCheck'] },
    [RULES.cancelled]: { stage: 'intent', settings: [] },
    [RULES.visitManual]: { stage: 'visit', settings: [] },
    [RULES.automatic]: { stage: 'eligibility', settings: ['categorySelections'] },
    [RULES.manual]: { stage: 'eligibility', settings: ['categorySelections'] },
    [RULES.enter]: { stage: 'visit', settings: ['skipOnSeekToSegment'] },
    [RULES.within]: { stage: 'visit', settings: [] },
    [RULES.leave]: { stage: 'visit', settings: [] },
    [RULES.resumeEntry]: { stage: 'intent', settings: ['skipResumeAction'] },
    [RULES.resumeSpeed]: { stage: 'intent', settings: ['speedUpResumeAction'] },
    [RULES.paused]: { stage: 'playback', settings: [] },
    [RULES.explicit]: { stage: 'intent', settings: [] },
    [RULES.userRate]: { stage: 'intent', settings: [] },
    [RULES.overlap]: { stage: 'intent', settings: [] },
    [RULES.applied]: { stage: 'playback', settings: [] },
    [RULES.merged]: { stage: 'playback', settings: [] },
    [RULES.point]: { stage: 'playback', settings: ['categorySelections'] },
    [RULES.seek]: { stage: 'playback', settings: ['enableSpeedUp'] },
    [RULES.speed]: { stage: 'playback', settings: ['enableSpeedUp', 'speedUpPlaybackRate'] },
    [RULES.mute]: { stage: 'playback', settings: ['muteSegments'] },
    [RULES.preview]: { stage: 'card', settings: ['advanceSkipNotice', 'skipNoticeDurationBefore'] },
    [RULES.media]: { stage: 'card', settings: [] },
    [RULES.display]: { stage: 'card', settings: ['skipNoticeDuration'] },
    [RULES.hidden]: { stage: 'card', settings: ['dontShowNotice'] },
};

export interface Eligibility { rule: RuleId; show: boolean; automatic: boolean }
interface PermissionRule extends Eligibility { matches: (segment: RuleSegment, visit: Visit, input: RuleInput) => boolean }
const policy = (segment: RuleSegment, input: RuleInput) => input.previewId === segment.id ? 'auto' : segment.policy;

/** First matching restriction wins. A selected editor preview still passes safety gates. */
export const eligibilityRules: readonly PermissionRule[] = [
    { rule: RULES.invalid, show: false, automatic: false, matches: s =>
        !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start || s.action === 'full' || s.action === 'poi' },
    { rule: RULES.excluded, show: false, automatic: false, matches: (_s, v) => v.excluded === 'dismiss' },
    { rule: RULES.disabled, show: false, automatic: false, matches: (_s, _v, i) => i.disabled },
    { rule: RULES.editing, show: false, automatic: false, matches: (s, _v, i) => i.editing && !i.includeOtherSegments && i.previewId !== s.id },
    { rule: RULES.draft, show: false, automatic: false, matches: (s, _v, i) => !!s.draft && i.previewId !== s.id },
    { rule: RULES.disabled, show: false, automatic: false, matches: (s, _v, i) => ['ignore', 'mark'].includes(policy(s, i)) },
    { rule: RULES.cancelled, show: true, automatic: false, matches: (_s, v) => !!v.excluded },
    { rule: RULES.visitManual, show: true, automatic: false, matches: (_s, v) => !v.auto },
    { rule: RULES.manual, show: true, automatic: false, matches: (s, v, i) => policy(s, i) === 'manual' && !v.manual },
    { rule: RULES.automatic, show: true, automatic: true, matches: () => true },
];

export function eligibility(segment: RuleSegment, visit: Visit, input: RuleInput): Eligibility {
    const { rule, show, automatic } = eligibilityRules.find(rule => rule.matches(segment, visit, input))!;
    return { rule, show, automatic };
}
