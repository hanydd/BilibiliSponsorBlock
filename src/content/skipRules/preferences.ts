import type Config from '../../config';
import type { PolicySettings, RuleInput } from './types';

export function policyPreferences(config: PolicySettings): PolicySettings {
    return { autoSkipOnMusicVideos: config.autoSkipOnMusicVideos, manualSkipOnFullVideo: config.manualSkipOnFullVideo,
        muteSegments: config.muteSegments, minDuration: Number(config.minDuration) || 0 };
}

export type RulePreferences = Pick<typeof Config.config, 'enableSpeedUp' | 'skipOnSeekToSegment' |
    'advanceSkipNotice' | 'skipNoticeDurationBefore' | 'dontShowNotice' | 'previewIncludeOtherSegments'> &
    Partial<Pick<typeof Config.config, 'skipResumeAction' | 'speedUpResumeAction'>>;

/** The runtime and rule explorer use this same mapping of existing user settings. */
export function rulePreferences(config: RulePreferences): Pick<RuleInput, 'speedUp' | 'skipOnEntry' | 'previewLead' | 'showNotices' | 'includeOtherSegments' | 'resumeAction' | 'speedUpResumeAction'> {
    return {
        speedUp: config.enableSpeedUp,
        resumeAction: config.skipResumeAction ?? 'continue',
        speedUpResumeAction: config.speedUpResumeAction ?? 'continue',
        skipOnEntry: config.skipOnSeekToSegment,
        previewLead: config.advanceSkipNotice ? config.skipNoticeDurationBefore : 0,
        showNotices: !config.dontShowNotice,
        includeOtherSegments: config.previewIncludeOtherSegments,
    };
}
