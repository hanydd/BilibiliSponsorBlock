import * as React from 'react';
import Config from '../../config';
import { message, t } from './text';
import type { Settings } from './model';
import { policyPreferences } from '../../content/skipRules/preferences';

type Key = keyof typeof Config.config;
export function currentSettings(): Settings {
    return { entry: Config.config.skipOnSeekToSegment, preview: Config.config.advanceSkipNotice ? Number(Config.config.skipNoticeDurationBefore) : 0,
        duration: Number(Config.config.skipNoticeDuration), rate: Number(Config.config.speedUpPlaybackRate), showCards: !Config.config.dontShowNotice,
        resumeEntry: Config.config.skipResumeAction, resumeSpeed: Config.config.speedUpResumeAction, disabled: Config.config.disableSkipping,
        policy: policyPreferences(Config.config) };
}
export function SettingsPanel({ update }: { update: <K extends Key>(key: K, value: typeof Config.config[K]) => void }): JSX.Element {
    function select<K extends Key>(key: K, label: string, options: Array<[string | number, string]>) {
        return <label>{label}<select className="optionsSelector" data-rule-setting={key} value={String(Config.config[key])}
            onChange={e => update(key, (typeof options[0][0] === 'number' ? Number(e.target.value) : e.target.value) as typeof Config.config[K])}>
            {options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select></label>;
    }
    function number(key: 'skipNoticeDuration' | 'skipNoticeDurationBefore', label: string, disabled = false) {
        return <label>{label}<input type="number" min="1" step="1" disabled={disabled} data-rule-setting={key} value={Config.config[key]}
            onChange={e => { const value = Number(e.target.value); if (Number.isFinite(value) && value >= 1) update(key, Math.round(value)); }} /></label>;
    }
    return <section className="rules-settings" aria-label={t('sharedSettings')}>
        <div className="rules-settings-heading"><h3>{t('sharedSettings')}</h3><button type="button" className="rules-link" onClick={() => {
            for (const key of ['skipOnSeekToSegment', 'speedUpPlaybackRate', 'advanceSkipNotice', 'skipNoticeDurationBefore', 'skipNoticeDuration', 'dontShowNotice', 'skipResumeAction', 'speedUpResumeAction', 'previewIncludeOtherSegments', 'disableSkipping'] as const) update(key, Config.syncDefaults[key]);
        }}>{t('resetSettings')}</button></div><div className="rules-setting-grid">
            <label>{t('entry')}<select className="optionsSelector" data-rule-setting="skipOnSeekToSegment" value={String(Config.config.skipOnSeekToSegment)} onChange={e => update('skipOnSeekToSegment', e.target.value === 'true')}>
                <option value="true">{t('entry_follow')}</option><option value="false">{t('entry_ask')}</option></select></label>
            {select('speedUpPlaybackRate', message('speedUpPlaybackRate'), [2, 3, 4, 6, 8, 16].map(value => [value, value + '×']))}
            <label>{t('previewSwitch')}<input type="checkbox" data-rule-setting="advanceSkipNotice" checked={Config.config.advanceSkipNotice} onChange={e => update('advanceSkipNotice', e.target.checked)} /></label>
            {number('skipNoticeDurationBefore', t('previewSeconds'), !Config.config.advanceSkipNotice)}
            {number('skipNoticeDuration', t('duration'))}
            <label>{t('showCards')}<input type="checkbox" data-rule-setting="dontShowNotice" checked={!Config.config.dontShowNotice} onChange={e => update('dontShowNotice', !e.target.checked)} /></label>
        </div><div className="rules-resume-grid">
            {select('skipResumeAction', message('skipResumeAction'), [['continue', message('resumeFollowPolicy')], ['manual', message('resumeManual')]])}
            {select('speedUpResumeAction', message('speedUpResumeAction'), [['continue', message('resumeSpeedContinue')], ['manual', message('resumeSpeedManual')]])}
        </div><div className="rules-resume-grid">
            <label>{message('previewIncludeOtherSegments')}<input type="checkbox" data-rule-setting="previewIncludeOtherSegments" checked={Config.config.previewIncludeOtherSegments} onChange={e => update('previewIncludeOtherSegments', e.target.checked)} /></label>
            <label>{t('enableSkipping')}<input type="checkbox" data-rule-setting="disableSkipping" checked={!Config.config.disableSkipping} onChange={e => update('disableSkipping', !e.target.checked)} /></label>
        </div><p className="small-description">{t('resumeNote')} {t('saved')}</p>
    </section>;
}
