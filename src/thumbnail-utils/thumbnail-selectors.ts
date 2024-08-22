import { PageType } from "../types";

interface ThumbnailSelector {
    containerSelector: string;
    thumbnailSelector: string;
    customLinkSelector?: string;
}

const thumbnailSelectors: { [key: string]: ThumbnailSelector } = {
    "mainPageRecommendation": {
        // 主页
        containerSelector: ".recommended-container_floor-aside .container",
        thumbnailSelector: ".bili-video-card",
    },
    "playerSideRecommendation": {
        // 播放页推荐
        containerSelector: "#reco_list",
        thumbnailSelector: ".video-page-card-small",
    },
    "space": {
        // 用户空间页
        containerSelector: ".s-space",
        thumbnailSelector: "li.small-item",
    },
    "dynamic": {
        // 动态页面
        containerSelector: ".bili-dyn-list",
        thumbnailSelector: ".bili-dyn-content",
    },
    "dynamicPopup": {
        // 动态弹出框
        containerSelector: ".bili-header .right-entry .v-popover-wrap:nth-of-type(3)",
        thumbnailSelector: "a.dynamic-video-item",
    },
    "search": {
        // 搜索页
        containerSelector: ".search-page",
        thumbnailSelector: ".bili-video-card",
    },
};

const commonSelector = ["dynamicPopup"];
const pageTypeSepecialSelector: { [key in PageType]: string[] } = {
    [PageType.Main]: ["mainPageRecommendation"],
    [PageType.History]: [],
    [PageType.Video]: ["playerSideRecommendation"],
    [PageType.List]: [],
    [PageType.Search]: ["search"],
    [PageType.Dynamic]: ["dynamic"],
    [PageType.Channel]: ["space"],
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
    thumbnailElementSelectors[key] = combinedSelector.map((s) => thumbnailSelectors[s].thumbnailSelector);
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
