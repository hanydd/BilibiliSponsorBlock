export function getYouTubeTitleNode(): HTMLElement {
    // New YouTube Title, YouTube, Mobile YouTube, Invidious
    return document.querySelector("#title h1, .ytd-video-primary-info-renderer.title, .slim-video-information-title, #player-container + .h-box > h1") as HTMLElement;
}