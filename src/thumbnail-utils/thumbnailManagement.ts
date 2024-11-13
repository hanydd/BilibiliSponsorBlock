import Config from "../config";
import { waitFor } from "../utils/";
import { addCleanupListener } from "../utils/cleanup";
import { getPageType } from "../utils/video";
import { getThumbnailContainerElements, getThumbnailLink, getThumbnailSelectors } from "./thumbnail-selectors";
import { insertSBIconDefinition, labelThumbnail, labelThumbnails } from "./thumbnails";

export type ThumbnailListener = (newThumbnails: HTMLElement[]) => void;

const handledThumbnailsObserverMap = new Map<HTMLElement, MutationObserver>();
let lastGarbageCollection = 0;
let thumbnailContainerObserver: MutationObserver | null = null;

export function setupThumbnailListener(): void {
    const onLoad = () => {
        onInitialLoad();

        // listen to container child changes
        getThumbnailContainerElements(getPageType()).forEach((selector) => {
            void waitFor(() => document.querySelector(selector), 10000)
                .then((thumbnailContainer) => {
                    newThumbnails(); // fire thumbnail check once when the container is loaded
                    if (!thumbnailContainer) return;
                    thumbnailContainerObserver ??= new MutationObserver(() => newThumbnails());
                    thumbnailContainerObserver?.observe(thumbnailContainer, { childList: true, subtree: true });
                })
                .catch((err) => {
                    console.log(err);
                });
        });
    };

    if (document.readyState === "complete") {
        onLoad();
    } else {
        window.addEventListener("load", onLoad);
    }

    void waitFor(() => Config.isReady(), 5000, 10).then(() => {
        newThumbnails();
    });

    addCleanupListener(() => {
        thumbnailContainerObserver?.disconnect();
        for (const handledThumbnailObserver of handledThumbnailsObserverMap) {
            handledThumbnailObserver[1].disconnect();
        }

        handledThumbnailsObserverMap.clear();
    });
}

function onInitialLoad() {
    insertSBIconDefinition();
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

    const notNewThumbnails = handledThumbnailsObserverMap.keys();

    const thumbnails = document.querySelectorAll(getThumbnailSelectors(getPageType())) as NodeListOf<HTMLElement>;
    const newThumbnailsFound: HTMLElement[] = [];
    for (const thumbnail of thumbnails) {
        if (!handledThumbnailsObserverMap.has(thumbnail)) {
            newThumbnailsFound.push(thumbnail);

            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === "attributes" && mutation.attributeName === "href") {
                        labelThumbnail(thumbnail as HTMLImageElement, mutation.oldValue);
                        break;
                    }
                }
            });
            handledThumbnailsObserverMap.set(thumbnail, observer);

            const link = getThumbnailLink(thumbnail);
            if (link) observer.observe(link, { attributes: true, attributeOldValue: true, attributeFilter: ["href"] });
        }
    }

    labelThumbnails(newThumbnailsFound);

    if (performance.now() - lastGarbageCollection > 5000) {
        // Clear old ones (some will come back if they are still on the page)
        // But are handled by happening to be when new ones are added too
        for (const thumbnail of notNewThumbnails) {
            if (!document.body.contains(thumbnail)) {
                const observer = handledThumbnailsObserverMap.get(thumbnail);
                observer?.disconnect();
                handledThumbnailsObserverMap.delete(thumbnail);
            }
        }

        lastGarbageCollection = performance.now();
    }
}

export function updateAll(): void {
    labelThumbnails([...handledThumbnailsObserverMap.keys()]);
}
