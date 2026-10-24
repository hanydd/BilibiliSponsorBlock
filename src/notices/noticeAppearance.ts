import { NoticeVisibilityMode } from '../types';

export type NoticeAppearanceScope = 'never' | 'handled' | 'all';
export interface NoticeAppearance {
    collapse: NoticeAppearanceScope;
    fade: NoticeAppearanceScope;
}

// Keep the five stored legacy values unchanged, including the implicit collapse
// of every notice in both faded modes. The remaining values allow independent choices.
const appearances: Record<NoticeVisibilityMode, Readonly<NoticeAppearance>> = {
    [NoticeVisibilityMode.FullSize]: { collapse: 'never', fade: 'never' },
    [NoticeVisibilityMode.MiniForAutoSkip]: { collapse: 'handled', fade: 'never' },
    [NoticeVisibilityMode.MiniForAll]: { collapse: 'all', fade: 'never' },
    [NoticeVisibilityMode.FadedForAutoSkip]: { collapse: 'all', fade: 'handled' },
    [NoticeVisibilityMode.FadedForAll]: { collapse: 'all', fade: 'all' },
    [NoticeVisibilityMode.FullSizeFadedForHandled]: { collapse: 'never', fade: 'handled' },
    [NoticeVisibilityMode.FullSizeFadedForAll]: { collapse: 'never', fade: 'all' },
    [NoticeVisibilityMode.MiniForHandledFadedForHandled]: { collapse: 'handled', fade: 'handled' },
    [NoticeVisibilityMode.MiniForHandledFadedForAll]: { collapse: 'handled', fade: 'all' },
};

export function getNoticeAppearance(mode: NoticeVisibilityMode): Readonly<NoticeAppearance> {
    return appearances[mode] ?? appearances[NoticeVisibilityMode.FadedForAutoSkip];
}

export function noticeAppearanceMode(appearance: NoticeAppearance): NoticeVisibilityMode {
    const match = Object.entries(appearances).find(([, value]) => value.collapse === appearance.collapse && value.fade === appearance.fade);
    if (!match) throw new Error('Invalid notice appearance');
    return Number(match[0]) as NoticeVisibilityMode;
}
