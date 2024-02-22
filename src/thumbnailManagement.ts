import { waitFor } from ".";
import { addCleanupListener } from "./cleanup";
import { getThumbnailContainerElements, getThumbnailLink, getThumbnailSelectors } from "./thumbnail-selectors";

export type ThumbnailListener = (newThumbnails: HTMLElement[]) => void;

const handledThumbnails = new Map<HTMLElement, MutationObserver>();
let lastGarbageCollection = 0;
let thumbnailListener: ThumbnailListener | null = null;
let thumbnailContainerObserver: MutationObserver | null = null;
let selector = getThumbnailSelectors();

export function setThumbnailListener(listener: ThumbnailListener, onInitialLoad: () => void,
        configReady: () => boolean, selectorParam?: string): void {
    thumbnailListener = listener;
    if (selectorParam) selector = selectorParam;

    const onLoad = () => {
        onInitialLoad?.();

        // listen to container child changes
        void waitFor(() => document.querySelector(getThumbnailContainerElements())).then((thumbnailContainer) => {
            newThumbnails(); // fire thumbnail check once when the container is loaded
            if (!thumbnailContainer) return;
            thumbnailContainerObserver ??= new MutationObserver(() => newThumbnails());
            thumbnailContainerObserver.observe(thumbnailContainer, { childList: true, subtree: true })
        }).catch((err) => {console.log(err)})
    };

    if (document.readyState === "complete") {
        onLoad();
    } else {
        window.addEventListener("load", onLoad);
    }

    void waitFor(() => configReady(), 5000, 10).then(() => {
        newThumbnails();
    });

    addCleanupListener(() => {
        thumbnailContainerObserver?.disconnect();
        for (const handledThumbnail of handledThumbnails) {
            handledThumbnail[1].disconnect();
        }

        handledThumbnails.clear();
    });
}

let lastThumbnailCheck = 0;
let thumbnailCheckTimeout: NodeJS.Timer | null = null;

export function newThumbnails() {
    if (performance.now() - lastThumbnailCheck < 50 || thumbnailCheckTimeout) {
        if (thumbnailCheckTimeout) {
            return;
        } else {
            thumbnailCheckTimeout = setTimeout(() => {
                thumbnailCheckTimeout = null;
                newThumbnails();
            }, 50);
            return;
        }
    }

    lastThumbnailCheck = performance.now();

    const notNewThumbnails = handledThumbnails.keys();

    const thumbnails = document.querySelectorAll(selector) as NodeListOf<HTMLElement>;
    const newThumbnailsFound: HTMLElement[] = [];
    for (const thumbnail of thumbnails) {
        if (!handledThumbnails.has(thumbnail)) {
            newThumbnailsFound.push(thumbnail);

            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === "attributes" && mutation.attributeName === "href") {
                        thumbnailListener?.([thumbnail]);
                        break;
                    }
                }
            });
            handledThumbnails.set(thumbnail, observer);

            const link = getThumbnailLink(thumbnail);
            if (link) observer.observe(link, { attributes: true });
        }
    }

    thumbnailListener?.(newThumbnailsFound);

    if (performance.now() - lastGarbageCollection > 5000) {
        // Clear old ones (some will come back if they are still on the page)
        // But are handled by happening to be when new ones are added too
        for (const thumbnail of notNewThumbnails) {
            if (!document.body.contains(thumbnail)) {
                const observer = handledThumbnails.get(thumbnail);
                observer?.disconnect();
                handledThumbnails.delete(thumbnail);
            }
        }

        lastGarbageCollection = performance.now();
    }
}

export function updateAll(): void {
    if (thumbnailListener) thumbnailListener([...handledThumbnails.keys()]);
}
