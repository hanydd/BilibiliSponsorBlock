import Config from "../config";
import { getPageLoaded } from "../content";
import { waitFor } from "../utils/";
import { addCleanupListener } from "../utils/cleanup";
import { getPageType } from "../utils/video";
import { getThumbnailContainerElements, getThumbnailSelectors, shouldWaitForPageLoad } from "./thumbnail-selectors";
import { insertSBIconDefinition, labelThumbnail } from "./thumbnails";

export type ThumbnailListener = (newThumbnails: HTMLElement[]) => void;

const handledThumbnailsObserverMap = new Map<HTMLElement, MutationObserver>();
let thumbnailContainerObserver: MutationObserver | null = null;

let lastThumbnailCheck = 0;

export function setupThumbnailListener(): void {
    const onLoad = () => {
        onInitialLoad();

        // listen to container child changes
        getThumbnailContainerElements(getPageType()).forEach(({ selector }) => {
            void waitFor(() => document.querySelector(selector), 10000)
                .then((thumbnailContainer) => {
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

let thumbnailCheckTimeout: NodeJS.Timer | null = null;
export function checkPageForNewThumbnails() {
    if (performance.now() - lastThumbnailCheck < 100 || thumbnailCheckTimeout) {
        if (!thumbnailCheckTimeout) {
            thumbnailCheckTimeout = setTimeout(() => {
                thumbnailCheckTimeout = null;
                checkPageForNewThumbnails();
            }, 1000);
        }
        return;
    }
    lastThumbnailCheck = performance.now();

    for (const { containerType, selector } of getThumbnailContainerElements(getPageType())) {
        waitFor(() => (shouldWaitForPageLoad(containerType) ? getPageLoaded() : true), 30000, 10)
            .then(() => waitFor(() => document.querySelector(selector), 10000))
            .finally(() => labelNewThumbnails(document.querySelector(selector), containerType))
            .catch((err) => console.log("Fail to get ", selector, err));
    }
}

function labelNewThumbnails(container: Element, containerType: string) {
    if (!container || !document.body.contains(container)) return;
    const thumbnails = container.querySelectorAll(getThumbnailSelectors(containerType)) as NodeListOf<HTMLElement>;
    thumbnails.forEach((t) => labelThumbnail(t as HTMLImageElement, containerType));
}
