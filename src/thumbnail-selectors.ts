export function getThumbnailElements() {
    return [
        ".bili-video-card", // main page
        ".video-page-card-small", // recommendation on player page
        ".s-space .small-item", // user space page
        ".bili-dyn-content", // dynamic page feed
    ];
}

export function getThumbnailContainerElements() {
    return ".recommended-container_floor-aside .container," // main page
        +  "#reco_list," // recommendation on player page
        +  ".s-space," // user space page
        +  ".bili-dyn-list"; // dynamic page feed
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
