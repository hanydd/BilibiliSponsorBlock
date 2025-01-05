import { PageType } from "../types";

interface ThumbnailSelector {
    containerSelector: string;
    thumbnailSelector: string;
    customLinkSelector?: string;
}

// TODO: support customLinkSelector
const thumbnailSelectors: { [key: string]: ThumbnailSelector } = {
    "dynamicPopup": {
        // 动态弹出框
        containerSelector: ".bili-header .right-entry .v-popover-wrap:nth-of-type(3)",
        thumbnailSelector: "a[data-mod=top_right_bar_window_dynamic]",
    },
    "historyPopup": {
        // 历史视频弹出框
        containerSelector: ".bili-header .right-entry .v-popover-wrap:nth-of-type(5) div.v-popover-content",
        thumbnailSelector: "a.header-history-card",
        customLinkSelector: "",
    },
    "mainPageRecommendation": {
        // 主页
        containerSelector: ".recommended-container_floor-aside .container",
        thumbnailSelector: ".bili-video-card",
    },
    "playerSideRecommendation": {
        // 播放页推荐
        containerSelector: ".right-container",
        thumbnailSelector: ".video-page-card-small",
    },
    "listPlayerSideRecommendation": {
        // 列表播放页推荐
        containerSelector: ".recommend-list-container",
        thumbnailSelector: ".video-card",
    },
    "playerListCard": {
        // 播放页播放列表
        // TODO: 无法获取视频链接
        containerSelector: "video-sections-v1",
        thumbnailSelector: ".video-episode-card",
    },
    "listPlayerListCard": {
        // 列表播放页播放列表
        // TODO: 无法获取视频链接
        containerSelector: "#playlist-video-action-list-body",
        thumbnailSelector: ".action-list-item",
    },
    "oldSpaceMain": {
        // 旧用户空间主页
        containerSelector: ".s-space .i-pin-v",
        thumbnailSelector: ".i-pin-part",
    },
    "spaceMain": {
        // 新用户空间主页 2412更新
        containerSelector: ".space-home",
        thumbnailSelector: ".bili-video-card",
    },
    "oldSpaceUpload": {
        // 旧用户空间投稿+首页投稿
        containerSelector: ".s-space",
        thumbnailSelector: ".small-item",
    },
    "spaceUpload": {
        // 新用户空间投稿+首页投稿 2412更新
        containerSelector: ".space-main",
        thumbnailSelector: ".bili-video-card",
    },
    "dynamic": {
        // 动态首页页面
        containerSelector: "section:has(.bili-dyn-list)",
        thumbnailSelector: ".bili-dyn-content",
    },
    "channelDynamic": {
        // 用户空间动态
        containerSelector: ".bili-dyn-list",
        thumbnailSelector: ".bili-dyn-content",
    },
    "search": {
        // 搜索页
        containerSelector: ".search-page-wrapper",
        thumbnailSelector: ".bili-video-card",
    },
    "history": {
        // 历史页
        containerSelector: ".main-content",
        thumbnailSelector: ".history-card",
    },
};

const commonSelector = ["dynamicPopup", "historyPopup"];
const pageTypeSepecialSelector: { [key in PageType]: string[] } = {
    [PageType.Main]: ["mainPageRecommendation"],
    [PageType.History]: [],
    [PageType.Video]: ["playerSideRecommendation", "playerListCard"],
    [PageType.List]: ["listPlayerSideRecommendation", "listPlayerListCard"],
    [PageType.Search]: ["search"],
    [PageType.Dynamic]: ["dynamic"],
    [PageType.Channel]: ["oldSpaceMain", "spaceMain", "oldSpaceUpload", "spaceUpload", "channelDynamic"],
    [PageType.Message]: [],
    [PageType.Manga]: [],
    [PageType.Anime]: [],
    [PageType.Live]: [],
    [PageType.Unknown]: [],
    [PageType.Embed]: [],
};

const pageTypeSelector: { [key in PageType]?: ThumbnailSelector } = {};
const thumbnailElementSelectors: { [key in PageType]?: string[] } = {};
const thumbnailContainerSelectors: { [key in PageType]?: string[] } = {};
for (const [key, value] of Object.entries(pageTypeSepecialSelector)) {
    const combinedSelector = [...commonSelector, ...value];
    pageTypeSelector[key] = combinedSelector.map((s) => thumbnailSelectors[s]);
    thumbnailElementSelectors[key] = combinedSelector.map(
        (s) => `${thumbnailSelectors[s].containerSelector} ${thumbnailSelectors[s].thumbnailSelector}`
    );
    thumbnailContainerSelectors[key] = combinedSelector.map((s) => thumbnailSelectors[s].containerSelector);
}

export function getThumbnailContainerElements(pageType: PageType) {
    return thumbnailContainerSelectors[pageType];
}

export function getThumbnailLink(thumbnail: HTMLElement): HTMLElement | null {
    return thumbnail.querySelector("a");
}

export function getThumbnailSelectors(pageType: PageType) {
    return thumbnailElementSelectors[pageType].join(", ");
}
