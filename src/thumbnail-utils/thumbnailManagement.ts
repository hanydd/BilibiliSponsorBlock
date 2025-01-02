import Config from "../config";
import { waitFor } from "../utils/";
import { addCleanupListener } from "../utils/cleanup";
import { getPageType } from "../utils/video";
import { getThumbnailContainerElements, getThumbnailSelectors } from "./thumbnail-selectors";
import { insertSBIconDefinition, labelThumbnail, labelThumbnails } from "./thumbnails";

export type ThumbnailListener = (newThumbnails: HTMLElement[]) => void;

const handledThumbnailsObserverMap = new Map<HTMLElement, MutationObserver>();
let thumbnailContainerObserver: MutationObserver | null = null;

export function setupThumbnailListener(): void {
    const onLoad = () => {
        onInitialLoad();

        // listen to container child changes
        getThumbnailContainerElements(getPageType()).forEach((selector) => {
            void waitFor(() => document.querySelector(selector), 10000)
                .then((thumbnailContainer) => {
                    labelNewThumbnails(thumbnailContainer); // fire thumbnail check once when the container is loaded
                    if (!thumbnailContainer) return;
                    thumbnailContainerObserver ??= new MutationObserver(() => checkPageForNewThumbnails());
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
        checkPageForNewThumbnails();
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

export function checkPageForNewThumbnails() {
    if (performance.now() - lastThumbnailCheck < 50 || thumbnailCheckTimeout) {
        if (thumbnailCheckTimeout) {
            return;
        } else {
            thumbnailCheckTimeout = setTimeout(() => {
                thumbnailCheckTimeout = null;
                checkPageForNewThumbnails();
            }, 1000);
            return;
        }
    }
    lastThumbnailCheck = performance.now();

    for (const selector of getThumbnailContainerElements(getPageType())) {
        waitFor(() => document.querySelector(selector), 10000)
            .then((thumbnailContainer) => labelNewThumbnails(thumbnailContainer))
            .catch((err) => console.log(err));
    }
}

async function labelNewThumbnails(container: Element) {
    if (!container || !document.body.contains(container)) return;
    const thumbnails = container.querySelectorAll(getThumbnailSelectors(getPageType())) as NodeListOf<HTMLElement>;
    thumbnails.forEach((t) => labelThumbnail(t as HTMLImageElement));
}

export function updateAll(): void {
    labelThumbnails([...handledThumbnailsObserverMap.keys()]);
}
