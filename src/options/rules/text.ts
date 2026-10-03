import { ruleDefinitions } from '../../content/skipRules/rules';
import type { RuleTrace } from '../../content/skipRules/types';
import type { Result } from './model';

export const t = (key: string, substitutions?: string | string[]): string => chrome.i18n.getMessage('rules_' + key, substitutions);
export const message = (key: string): string => chrome.i18n.getMessage(key);
export const ruleName = (id: string): string => t('rule_' + id.replace(/-/g, '_') + '_name') || id;
export const ruleDescription = (id: string): string => t('rule_' + id.replace(/-/g, '_') + '_description');
export const ruleInfo = (id: string): typeof ruleDefinitions[keyof typeof ruleDefinitions] | undefined => ruleDefinitions[id];
export const traceText = (trace: RuleTrace): string => (t('result_' + trace.result.replace(/-/g, '_')) || trace.result) + (trace.relatedIds?.length ? ' · ' + t('protectionSources', trace.relatedIds.join('、')) : '');
export function playbackText(result: Result): string {
    const last = result.effects[result.effects.length - 1];
    if (last) return t(last.reason === 'undo' ? 'returnTo' : 'jumpTo', String(last.time));
    if (result.state.paused) return t('paused');
    if (result.state.waiting) return t('buffering');
    if (result.state.muted) return t('phase_muted');
    if (result.state.plan?.speed.length) return t('fastRate', String(result.state.rate));
    return result.state.rate === 1 ? t('playing') : t('keepRate', String(result.state.rate));
}
const settingMessages: Record<string, string> = {
    categorySelections: 'skipOption', skipOnSeekToSegment: 'enableSkipOnSeekToSegment', dontShowNotice: 'showSkipNotice',
    noticeVisibilityMode: 'noticeVisibilityLabel', manualSkipOnFullVideo: 'enableManualSkipOnFullVideo', whitelistedChannels: 'whitelistManagement',
};
export const settingName = (key: string): string => message(settingMessages[key] ?? key) || key;
