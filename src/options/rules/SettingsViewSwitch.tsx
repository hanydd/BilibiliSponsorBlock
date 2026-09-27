import * as React from 'react';
import Config from '../../config';
import { t } from './text';

/** Explicit version selection also chooses the corresponding playback engine. */
export function SettingsViewSwitch({ view }: { view: 'behavior' | 'skip-rules' }): JSX.Element {
    function navigate(target: typeof view) {
        Config.config.skipEngineMode = target === 'skip-rules' ? 'rules' : 'legacy';
        if (target === view) return;
        document.querySelector<HTMLElement>(`.tab-heading[data-for="${target}"]`)?.click();
        document.querySelector<HTMLButtonElement>(`#${target} .options-view-switch [aria-pressed="true"]`)?.focus();
    }
    return <div className="options-view-switch">
        <div role="group" aria-label={t('settingsView')}>
            <span>{t('settingsView')}</span>
            <button type="button" aria-pressed={view === 'behavior'} onClick={() => navigate('behavior')}>{t('classicView')}</button>
            <button type="button" id={view === 'behavior' ? 'open-rule-settings' : undefined}
                aria-pressed={view === 'skip-rules'} onClick={() => navigate('skip-rules')}>{t('rulesView')}</button>
        </div>
        <p>{t('settingsViewDescription')}</p>
    </div>;
}
