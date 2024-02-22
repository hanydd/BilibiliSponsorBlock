export function getThumbnailElements() {
    return [
        ".bili-video-card", // 主页
        ".video-page-card-small", // 播放页推荐
        ".s-space .small-item", // 用户空间页
        ".bili-dyn-content", // 动态页面
        "a.dynamic-video-item" // 动态弹出框
    ];
}

export function getThumbnailContainerElements() {
    return ".recommended-container_floor-aside .container," // 主页
        +  "#reco_list," // 播放页推荐
        +  ".s-space," // 用户空间页
        +  ".bili-dyn-list" // 动态页面
        +  ".dynamic-panel-popover .dynamic-video"; // 动态弹出框
}

export function getThumbnailImageSelectors() {
    return "ytd-thumbnail:not([hidden]) img, ytd-playlist-thumbnail yt-image:not(.blurred-image) img";
}

export function getThumbnailLink(thumbnail: HTMLElement): HTMLElement | null {
    return thumbnail.querySelector(getThumbnailSelectors(" a"));

}

export function getThumbnailBoxSelectors() {
    return getThumbnailSelectors(":not([hidden])");

}

export function getThumbnailSelectors(additionalSelectors = "") {
    return getThumbnailElements().map((s) => `${s}${additionalSelectors}`).join(", ");
}
