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
    playback: ['muteSegments', 'minDuration', 'manualSkipOnFullVideo', 'forceChannelCheck']
        .map(key => `[data-sync="${key}"]`),
    notice: ['[data-sync="noticeVisibilityMode"]', '[data-sync="audioNotificationOnSkip"]'],
    categories: ['[data-sync="showCategoryWithoutPermission"]'],
    labels: ['[data-sync="fullVideoSegments"]'],
    community: ['[data-sync="dynamicAndCommentSponsorBlocker"]'],
    whitelist: ['[data-type="react-WhitelistManagerComponent"]'],
} as const;
