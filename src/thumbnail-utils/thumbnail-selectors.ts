import { PageType } from "../types";

interface ThumbnailSelector {
    containerSelector: string;
    thumbnailSelector: string;
    customLinkSelector?: string;
    customLinkAttribute?: string;
    labelAnchorSelector?: string;
    waitForPageLoad?: boolean;
    inShadowRoot?: boolean;
    parentElement?: string;
}

// TODO: support customLinkSelector
const thumbnailSelectors: { [key: string]: ThumbnailSelector } = {
    "dynamicPopup": {
        // 动态弹出框
        containerSelector: ".bili-header .right-entry .v-popover-wrap:nth-of-type(3)",
        thumbnailSelector: "a[data-mod=top_right_bar_window_dynamic]",
    },
    "favPopup": {
        // 收藏弹出框
        containerSelector: ".bili-header .right-entry .v-popover-wrap:nth-of-type(4)",
        thumbnailSelector: "a[data-mod=top_right_bar_window_default_collection]",
    },
    "historyPopup": {
        // 历史视频弹出框
        containerSelector: ".bili-header .right-entry .v-popover-wrap:nth-of-type(5)",
        thumbnailSelector: "a.header-history-card",
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
        labelAnchorSelector: ".b-img img"
    },
    "listPlayerSideRecommendation": {
        // 列表播放页推荐
        containerSelector: ".recommend-list-container",
        thumbnailSelector: ".video-card",
    },
    "playerListPod": {
        // 播放页播放列表，文字形式
        containerSelector: "div.video-pod",
        thumbnailSelector: "div.pod-item",
        customLinkSelector: ".pod-item.simple",
        customLinkAttribute: "data-key",
        labelAnchorSelector: "div.single-p .stats",
        waitForPageLoad: true,
    },
    "playerListPodVideo": {
        // 播放页播放列表，视频图形式
        containerSelector: "div.video-pod",
        thumbnailSelector: "div.pod-item",
        customLinkSelector: ".pod-item.normal",
        customLinkAttribute: "data-key",
        labelAnchorSelector: "div.single-p img",
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
    "oldHistory": {
        // 旧历史页
        containerSelector: ".list-contain",
        thumbnailSelector: "li.history-record",
        labelAnchorSelector: "a.preview img",
    },
    "history": {
        // 历史页
        containerSelector: ".main-content",
        thumbnailSelector: ".history-card",
        labelAnchorSelector: ".bili-cover-card__thumbnail > img",
    },
    "bilibiliGateMainPage": {
        //bilibili Gate脚本主页
        containerSelector: ".bilibili-gate-video-grid",
        thumbnailSelector: ".bili-video-card",
        labelAnchorSelector: ".bili-video-card__cover > img",
    },
    "bewlybewlyMainPage": {
        //bewlybewly插件主页
        parentElement: "#bewly",
        containerSelector: ".bewly-scroll-viewport",
        thumbnailSelector: ".video-card",
        labelAnchorSelector: ".vertical-card-cover img",
        inShadowRoot: true,
    },
    "bewlybewlySearch": {
        //bewlybewly插件搜索页
        parentElement: "#bewly",
        containerSelector: ".search-results-panel",
        thumbnailSelector: ".virtual-item",
        labelAnchorSelector: "img.image-transition",
        inShadowRoot: true,
    },
    "bewlybewlyHistory&WatchLater": {
        //bewlybewly插件播放历史&稍后再看页
        parentElement: "#bewly",
        containerSelector: ".bewly-scroll-viewport",
        thumbnailSelector: "a.group",
        labelAnchorSelector: "section img",
        inShadowRoot: true,
    },
    "bewlybewlyFavorites": {
        //bewlybewly插件搜索页
        parentElement: "#bewly",
        containerSelector: ".video-card-grid-container",
        thumbnailSelector: ".virtual-item",
        labelAnchorSelector: "picture img",
        inShadowRoot: true,
    },
    "bewlybewlyPoppu": {
        //bewlybewly插件弹出页集合
        parentElement: "#bewly",
        containerSelector: ".top-bar-header__side.top-bar-header__side--right",
        thumbnailSelector: "a.group, main a",
        labelAnchorSelector: "picture img, .group img",
        inShadowRoot: true,
    },
    "festivalPage": {
        //活动定制界面
        containerSelector: ".video-sections",
        thumbnailSelector: ".video-episode-card",
        labelAnchorSelector: ".activity-image-card__image",
    }
};

const commonSelector = ["dynamicPopup", "favPopup", "historyPopup", "bewlybewlyPoppu"];
const pageTypeSepecialSelector: { [key in PageType]: string[] } = {
    [PageType.Main]: ["mainPageRecommendation", "bilibiliGateMainPage", "bewlybewlyMainPage"],
    [PageType.History]: ["history", "bewlybewlyHistory&WatchLater"],
    [PageType.OldHistory]: ["oldHistory"],
    [PageType.Video]: ["playerSideRecommendation", "playerListPod", "playerListPodVideo"],
    [PageType.List]: ["listPlayerSideRecommendation", "listPlayerListCard", "bewlybewlyHistory&WatchLater", "bewlybewlyFavorites"],
    [PageType.Search]: ["search", "bewlybewlySearch"],
    [PageType.Dynamic]: ["dynamic"],
    [PageType.Channel]: ["oldSpaceMain", "spaceMain", "oldSpaceUpload", "spaceUpload", "channelDynamic"],
    [PageType.Message]: [],
    [PageType.Manga]: [],
    [PageType.Anime]: [],
    [PageType.Live]: [],
    [PageType.Opus]: [],
    [PageType.Unknown]: [],
    [PageType.Unsupported]: [],
    [PageType.Embed]: [],
    [PageType.Festival]: ["festivalPage"],
};

const combinedPageTypeSelectors = {};
for (const pageType in pageTypeSepecialSelector) {
    combinedPageTypeSelectors[pageType as PageType] = [
        ...commonSelector,
        ...pageTypeSepecialSelector[pageType as PageType],
    ];
}

export function getThumbnailContainerElements(pageType: PageType): { containerType: string; selector: string }[] {
    return combinedPageTypeSelectors[pageType].map((type: string) => ({
        containerType: type,
        selector: thumbnailSelectors[type].containerSelector,
    }));
}

export function getThumbnailLink(thumbnail: HTMLElement): HTMLElement | null {
    return thumbnail.querySelector("a");
}

export function getThumbnailSelectors(containerType: string) {
    return thumbnailSelectors[containerType].thumbnailSelector;
}

export function getLinkSelectors(containerType: string) {
    return thumbnailSelectors[containerType].customLinkSelector ?? "a[href]";
}

export function getLinkAttribute(containerType: string) {
    return thumbnailSelectors[containerType].customLinkAttribute ?? "href";
}

export function getLabelAnchorSelector(containerType: string) {
    return (
        thumbnailSelectors[containerType].labelAnchorSelector ??
        "div:not(.b-img--face) > picture img:not(.bili-avatar-img), div.bili-cover-card__thumbnail > img"
    );
}

export function shouldWaitForPageLoad(containerType: string): boolean {
    return thumbnailSelectors[containerType].waitForPageLoad ?? false;
}

export function isShadowRoot(containerType: string): boolean {
    return thumbnailSelectors[containerType].inShadowRoot ?? false;
}

export function getParentElement(containerType: string): string {
    return thumbnailSelectors[containerType].parentElement ?? null;
}
