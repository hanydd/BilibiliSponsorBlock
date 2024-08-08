export function getBilibiliTitleNodeSelector(): string {
    return ".video-info-container h1"; // bilibili
}

export function getBilibiliTitleNode(): HTMLElement {
    return document.querySelector(getBilibiliTitleNodeSelector()) as HTMLElement;
}
