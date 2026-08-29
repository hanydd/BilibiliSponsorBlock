export function assetUrl(path: string): string {
    return chrome.runtime.getURL(path.replace(/^\/+/, ""));
}
