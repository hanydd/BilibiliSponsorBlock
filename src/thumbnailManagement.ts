import { waitFor } from ".";
import { isOnInvidious } from "./video";

export type ThumbnailListener = (newThumbnails: HTMLElement[]) => void;

const handledThumbnails = new Set<HTMLElement>();
let thumbnailListener: ThumbnailListener | null = null;
let selector = "ytd-thumbnail, ytd-playlist-thumbnail";
let invidiousSelector = "div.thumbnail";

export function setThumbnailListener(listener: ThumbnailListener, onInitialLoad: () => void,
        configReady: () => boolean, selectorParam?: string,
            invidiousSelectorParam?: string): void {
    thumbnailListener = listener;
    if (selectorParam) selector = selectorParam;
    if (invidiousSelectorParam) invidiousSelector = invidiousSelectorParam;

    const onLoad = () => {
        onInitialLoad?.();

        // Label thumbnails on load if on Invidious (wait for variable initialization before checking)
        waitFor(() => isOnInvidious() !== null).then(() => {
            if (isOnInvidious()) newThumbnails();
        });
    };

    if (document.readyState === "complete") {
        onLoad();
    } else {
        window.addEventListener("load", onLoad);
    }

    waitFor(() => configReady(), 5000, 10).then(() => {
        newThumbnails();
    });
}

export function newThumbnails(): HTMLElement[] {
    const thumbnails = document.querySelectorAll(isOnInvidious() ? invidiousSelector : selector) as NodeListOf<HTMLElement>;
    const newThumbnails: HTMLElement[] = [];
    for (const thumbnail of thumbnails) {
        if (!handledThumbnails.has(thumbnail)) {
            handledThumbnails.add(thumbnail);

            newThumbnails.push(thumbnail);

            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === "attributes" && mutation.attributeName === "href") {
                        thumbnailListener?.([thumbnail]);
                        break;
                    }
                }
            });

            const link = thumbnail.querySelector("ytd-thumbnail a");
            if (link) observer.observe(link, { attributes: true });
        }
    }

    thumbnailListener?.(newThumbnails);
    return newThumbnails;
}

export function updateAll(): void {
    if (thumbnailListener) thumbnailListener([...handledThumbnails]);
}