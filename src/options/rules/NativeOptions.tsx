import * as React from 'react';

/** Move the existing controls, including their listeners and React roots, without cloning them. */
export function NativeOptions({ selectors, active }: { selectors: readonly string[]; active: boolean }): JSX.Element {
    const target = React.useRef<HTMLDivElement>(null);
    React.useLayoutEffect(() => {
        if (!active) return undefined;
        const moved = selectors.map(selector => {
            const element = document.querySelector<HTMLElement>(selector);
            if (!element) throw new Error(`Missing options control: ${selector}`);
            const home = document.createComment('options-home');
            element.before(home);
            target.current.appendChild(element);
            return { element, home };
        });
        return () => moved.forEach(({ element, home }) => { home.replaceWith(element); });
    }, [active, selectors]);
    return <div className="rules-native" ref={target} />;
}

export const nativeSettings = {
    playback: ['muteSegments', 'audioNotificationOnSkip', 'minDuration', 'manualSkipOnFullVideo', 'forceChannelCheck']
        .map(key => `[data-sync="${key}"]`),
    notice: ['[data-sync="noticeVisibilityMode"]'],
    supplements: ['fullVideoSegments', 'showCategoryWithoutPermission', 'dynamicAndCommentSponsorBlocker']
        .map(key => `[data-sync="${key}"]`),
    whitelist: ['[data-type="react-WhitelistManagerComponent"]'],
    shortcuts: ['skipKeybind', 'skipToHighlightKeybind', 'closeSkipNoticeKeybind'].map(key => `[data-sync="${key}"]`),
} as const;
