import Config from '../../config';

/** Onboarding only changes the existing engine preference; allocation belongs to config migration. */
export function setupRuleRollout(updateMode: () => void, openBehavior: () => void, embedded: boolean): void {
    const toggle = document.getElementById('rule-engine-enabled') as HTMLInputElement;
    const invitation = document.getElementById('rules-invitation');
    const dialog = document.getElementById('rules-welcome') as HTMLDialogElement;
    const closeWelcome = () => {
        Config.config.skipRulesNotice = 'welcome-dismissed';
        dialog.close();
    };
    const showWelcome = () => {
        if (!embedded && Config.config.showNewFeaturePopups && Config.config.skipRulesNotice !== 'welcome-dismissed' && !dialog.open) dialog.showModal();
    };
    function refresh() {
        const enabled = Config.config.skipEngineMode === 'rules';
        toggle.checked = enabled;
        invitation.hidden = embedded || enabled || !Config.config.showNewFeaturePopups ||
            Config.config.skipRulesRollout !== 'invite' || Config.config.skipRulesNotice !== 'unseen';
        document.getElementById('rules-welcome-auto').hidden = Config.config.skipRulesRollout !== 'auto';
        if (!enabled || !Config.config.showNewFeaturePopups) dialog.close();
        else if (Config.config.skipRulesRollout === 'auto') showWelcome();
    }
    function changeMode(enabled: boolean) {
        if (!enabled) closeWelcome();
        Config.config.skipEngineMode = enabled ? 'rules' : 'legacy';
        updateMode();
        refresh();
        if (enabled) showWelcome();
    }
    toggle.addEventListener('change', () => changeMode(toggle.checked));
    document.getElementById('rule-engine-disable').addEventListener('click', () => changeMode(false));
    document.getElementById('rules-invitation-enable').addEventListener('click', () => {
        changeMode(true);
        openBehavior();
    });
    document.getElementById('rules-invitation-close').addEventListener('click', () => {
        Config.config.skipRulesNotice = 'invitation-dismissed';
        refresh();
    });
    document.getElementById('rules-welcome-close').addEventListener('click', closeWelcome);
    document.getElementById('rules-welcome-start').addEventListener('click', () => { closeWelcome(); openBehavior(); });
    document.getElementById('rules-welcome-classic').addEventListener('click', () => { changeMode(false); openBehavior(); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeWelcome(); });
    Config.configSyncListeners.push(changes => {
        if (['skipEngineMode', 'skipRulesRollout', 'skipRulesNotice', 'showNewFeaturePopups'].some(key => key in changes)) {
            if (Config.config.skipRulesNotice === 'welcome-dismissed') dialog.close();
            refresh();
        }
    });
    refresh();
}
