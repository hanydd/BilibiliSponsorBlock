import Config from '../config';
import { getNoticeAppearance, noticeAppearanceMode, NoticeAppearanceScope } from '../notices/noticeAppearance';

export function refreshNoticeAppearance(element: Element): void {
    const appearance = getNoticeAppearance(Config.config.noticeVisibilityMode);
    for (const key of ['collapse', 'fade'] as const) {
        element.querySelector<HTMLSelectElement>(`[data-notice-appearance="${key}"]`).value = appearance[key];
    }
}

export function setupNoticeAppearance(element: Element): void {
    refreshNoticeAppearance(element);
    for (const key of ['collapse', 'fade'] as const) {
        const select = element.querySelector<HTMLSelectElement>(`[data-notice-appearance="${key}"]`);
        select.addEventListener('change', () => {
            Config.config.noticeVisibilityMode = noticeAppearanceMode({
                ...getNoticeAppearance(Config.config.noticeVisibilityMode),
                [key]: select.value as NoticeAppearanceScope,
            });
            refreshNoticeAppearance(element);
        });
    }
}
