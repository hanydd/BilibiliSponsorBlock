export function getYouTubeTitleNodeSelector(): string {
    // New YouTube Title, YouTube, Mobile YouTube, Invidious
    return "#title h1, .ytd-video-primary-info-renderer.title, .slim-video-information-title, #player-container + .h-box > h1";
}

export function getYouTubeTitleNode(): HTMLElement {
    return document.querySelector(getYouTubeTitleNodeSelector()) as HTMLElement;
}