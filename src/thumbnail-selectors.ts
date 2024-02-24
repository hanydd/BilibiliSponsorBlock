interface ThumbnailSelector {
    containerSelector: string;
    thumbnailSelector: string;
    customLinkSelector?: string;
}

const thumbnailSelectors: ThumbnailSelector[] = [
    {
        // 主页
        containerSelector: ".recommended-container_floor-aside .container",
        thumbnailSelector: ".bili-video-card"
    },
    {
        // 播放页推荐
        containerSelector: "#reco_list",
        thumbnailSelector: ".video-page-card-small"
    },
    {
        // 用户空间页
        containerSelector: ".s-space",
        thumbnailSelector: "li.small-item"
    },
    {
        // 动态页面
        containerSelector: ".bili-dyn-list",
        thumbnailSelector: ".bili-dyn-content"
    },
    {
        // 动态弹出框
        containerSelector: ".bili-header .right-entry .v-popover-wrap:nth-of-type(3)",
        thumbnailSelector: "a.dynamic-video-item",
        customLinkSelector: "a"
    }
];

const thumbnailElementSelectors = thumbnailSelectors.map((s) => s.thumbnailSelector);
export function getThumbnailElements() {
    return thumbnailElementSelectors;
}

const thumbnailContainerSelectors = thumbnailSelectors.map((s) => s.containerSelector);
export function getThumbnailContainerElements() {
    return thumbnailContainerSelectors;
}

export function getThumbnailLink(thumbnail: HTMLElement): HTMLElement | null {
    return thumbnail.querySelector(getThumbnailSelectors(" a"));
}

export function getThumbnailSelectors(additionalSelectors = "") {
    return getThumbnailElements().map((s) => `${s}${additionalSelectors}`).join(", ");
}
