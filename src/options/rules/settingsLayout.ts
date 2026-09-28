import type Config from '../../config';

export type SettingKey = keyof typeof Config.config;
export type SettingsGroup = 'segments' | 'matrix' | 'cards';
export const settingGroups = {
    segments: ['disableSkipping', 'enableSpeedUp', 'speedUpPlaybackRate'],
    matrix: ['skipOnSeekToSegment', 'skipResumeAction', 'speedUpResumeAction', 'previewIncludeOtherSegments'],
    cards: ['dontShowNotice', 'advanceSkipNotice', 'skipNoticeDurationBefore', 'skipNoticeDuration'],
} as const satisfies Record<SettingsGroup, readonly SettingKey[]>;
export type EditableSetting = typeof settingGroups[SettingsGroup][number];
export const editableSettings: readonly string[] = Object.values(settingGroups).flat();

/** Each preference has one home, even when edited beside a result. */
export function settingTab(key: string): SettingsGroup {
    if (key === 'audioNotificationOnSkip' || key === 'noticeVisibilityMode' || settingGroups.cards.some(value => value === key)) return 'cards';
    if (settingGroups.matrix.some(value => value === key)) return 'matrix';
    return 'segments';
}
