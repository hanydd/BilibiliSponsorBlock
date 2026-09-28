import * as React from 'react';
import Config from '../../config';
import { message, t } from './text';
import type { Settings } from './model';
import { policyPreferences } from '../../content/skipRules/preferences';
import { EditableSetting, SettingsGroup, settingGroups } from './settingsLayout';

type Key = keyof typeof Config.config;
function DurationSetting({ setting, label, disabled, update, inline }: {
    setting: 'skipNoticeDuration' | 'skipNoticeDurationBefore'; label: string; disabled?: boolean; inline?: boolean;
    update: (key: Key, value: number) => void;
}): JSX.Element {
    const value = Config.config[setting];
    const [draft, setDraft] = React.useState(String(value));
    React.useEffect(() => setDraft(String(value)), [value]);
    return <label><span>{label}</span><input type="number" min="1" step="1" disabled={disabled} data-rule-setting={inline ? undefined : setting} data-inline-setting={inline ? setting : undefined} value={draft}
        onChange={e => {
            setDraft(e.target.value);
            const next = Number(e.target.value);
            if (Number.isFinite(next) && next >= 1) update(setting, Math.round(next));
        }} onBlur={() => setDraft(String(Config.config[setting]))} /></label>;
}
export function currentSettings(): Settings {
    return { entry: Config.config.skipOnSeekToSegment, preview: Config.config.advanceSkipNotice ? Number(Config.config.skipNoticeDurationBefore) : 0,
        duration: Number(Config.config.skipNoticeDuration), rate: Number(Config.config.speedUpPlaybackRate), showCards: !Config.config.dontShowNotice,
        resumeEntry: Config.config.skipResumeAction, resumeSpeed: Config.config.speedUpResumeAction, disabled: Config.config.disableSkipping,
        policy: policyPreferences(Config.config) };
}
type Update = <K extends Key>(key: K, value: typeof Config.config[K]) => void;

export function RuleSetting({ setting, update, inline = false }: { setting: EditableSetting; update: Update; inline?: boolean }): JSX.Element {
    const attributes = inline ? { 'data-inline-setting': setting } : { 'data-rule-setting': setting };
    function select(key: 'speedUpPlaybackRate' | 'skipResumeAction' | 'speedUpResumeAction', label: string, options: Array<[string | number, string]>) {
        return <label><span>{label}</span><select className="optionsSelector" {...attributes} value={String(Config.config[key])}
            onChange={e => update(key, (typeof options[0][0] === 'number' ? Number(e.target.value) : e.target.value) as typeof Config.config[typeof key])}>
            {options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select></label>;
    }
    function toggle(key: 'enableSpeedUp' | 'advanceSkipNotice' | 'dontShowNotice' | 'disableSkipping' | 'previewIncludeOtherSegments', label: string, reverse = false) {
        return <label className="rules-toggle"><input type="checkbox" {...attributes} checked={reverse ? !Config.config[key] : Config.config[key]} onChange={e => update(key, reverse ? !e.target.checked : e.target.checked)} /><span>{label}</span></label>;
    }
    switch (setting) {
        case 'skipOnSeekToSegment': return <label><span>{t('entry')}</span><select className="optionsSelector" {...attributes} value={String(Config.config.skipOnSeekToSegment)} onChange={e => update('skipOnSeekToSegment', e.target.value === 'true')}>
            <option value="true">{t('entry_follow')}</option><option value="false">{t('entry_ask')}</option></select></label>;
        case 'enableSpeedUp': return toggle(setting, message('enableSpeedUp'));
        case 'disableSkipping': return toggle(setting, t('enableSkipping'), true);
        case 'speedUpPlaybackRate': return select(setting, message(setting), [2, 3, 4, 6, 8, 16].map(value => [value, value + '×']));
        case 'skipResumeAction': return select(setting, message(setting), [['continue', message('resumeFollowPolicy')], ['manual', message('resumeManual')]]);
        case 'speedUpResumeAction': return select(setting, message(setting), [['continue', message('resumeSpeedContinue')], ['manual', message('resumeSpeedManual')]]);
        case 'previewIncludeOtherSegments': return toggle(setting, message(setting));
        case 'advanceSkipNotice': return toggle(setting, t('previewSwitch'));
        case 'dontShowNotice': return toggle(setting, t('showCards'), true);
        case 'skipNoticeDurationBefore': return <DurationSetting setting={setting} label={t('previewSeconds')} disabled={!Config.config.advanceSkipNotice} update={update} inline={inline} />;
        case 'skipNoticeDuration': return <DurationSetting setting={setting} label={t('duration')} update={update} inline={inline} />;
    }
}

export function SettingsPanel({ group, update, children }: { group: SettingsGroup; update: Update; children?: React.ReactNode }): JSX.Element {
    return <section className="rules-settings" data-settings-group={group} aria-label={t('settings_' + group)}>
        <div className="rules-settings-heading"><h3>{t('settings_' + group)}</h3><button type="button" className="rules-link" onClick={() => {
            for (const key of settingGroups[group]) update(key, Config.syncDefaults[key]);
            if (group === 'cards') update('noticeVisibilityMode', Config.syncDefaults.noticeVisibilityMode);
        }}>{t('resetSection')}</button></div>
        <div className="rules-setting-grid">{settingGroups[group].map(setting => <RuleSetting key={setting} setting={setting} update={update} />)}{children}</div>
        <p className="small-description">{t(group === 'segments' ? 'speedHelp' : group === 'matrix' ? 'resumeNote' : 'countdownHelp')} {t('saved')}</p>
    </section>;
}
