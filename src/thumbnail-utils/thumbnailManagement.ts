import Config from "../config";
import { getPageLoaded } from "../content/state";
import { PageType } from "../types";
import { waitFor } from "../utils/";
import { addCleanupListener } from "../utils/cleanup";
import { getPageType } from "../utils/video";
import {
    getParentElement,
    getThumbnailContainerElements,
    getThumbnailSelectors,
    isShadowRoot,
} from "./thumbnail-selectors";
import { insertSBIconDefinition, labelThumbnail } from "./thumbnails";

export type ThumbnailListener = (newThumbnails: HTMLElement[]) => void;

interface ObservedThumbnailContainer {
    container: Element;
    observer: MutationObserver;
}

interface ResolvedThumbnailContainer {
    container: Element;
    root: Document | ShadowRoot;
}

const observedContainers = new Map<string, ObservedThumbnailContainer>();
const pendingContainers = new Map<string, Promise<void>>();

let refreshTimeout: NodeJS.Timeout | null = null;
let listenerSetup = false;
let listenerActive = false;
let thumbnailReady: Promise<boolean> | null = null;

export function setupThumbnailListener(): void {
    if (listenerSetup) return;
    listenerSetup = true;
    listenerActive = true;

    refreshThumbnailContainers();

    addCleanupListener(() => {
        listenerActive = false;
        if (refreshTimeout) {
            clearTimeout(refreshTimeout);
            refreshTimeout = null;
        }

        for (const { observer } of observedContainers.values()) {
            observer.disconnect();
        }
        observedContainers.clear();
        pendingContainers.clear();
    });
}

export function checkPageForNewThumbnails(): void {
    if (refreshTimeout) return;

    refreshTimeout = setTimeout(() => {
        refreshTimeout = null;
        refreshThumbnailContainers();
    }, 100);
}

function refreshThumbnailContainers(): void {
    if (!listenerActive) return;

    // disable on live pages to prevent memory leaks
    if (getPageType() === PageType.Live) return;

    const targets = getThumbnailContainerElements(getPageType());
    const activeContainerTypes = new Set(targets.map(({ containerType }) => containerType));

    for (const [containerType, observed] of observedContainers) {
        if (!activeContainerTypes.has(containerType)) {
            observed.observer.disconnect();
            observedContainers.delete(containerType);
        }
    }

    for (const { containerType, selector } of targets) {
        const observed = observedContainers.get(containerType);
        if (observed?.container.isConnected) {
            labelNewThumbnails(observed.container, containerType);
        } else {
            if (observed) {
                observed.observer.disconnect();
                observedContainers.delete(containerType);
            }
            setupThumbnailContainer(containerType, selector);
        }
    }
}

function setupThumbnailContainer(containerType: string, selector: string): void {
    if (pendingContainers.has(containerType)) return;

    const setup = resolveThumbnailContainer(containerType, selector)
        .then((resolved) => {
            if (!resolved || !isContainerTypeActive(containerType)) return;

            const existing = observedContainers.get(containerType);
            if (existing?.container === resolved.container) {
                labelNewThumbnails(existing.container, containerType);
                return;
            }
            existing?.observer.disconnect();

            if (resolved.root instanceof ShadowRoot) {
                insertShadowRootAssets(resolved.root);
            } else {
                insertSBIconDefinition();
            }

            labelNewThumbnails(resolved.container, containerType);

            const observer = new MutationObserver(() => {
                if (resolved.container.isConnected) {
                    labelNewThumbnails(resolved.container, containerType);
                } else {
                    checkPageForNewThumbnails();
                }
            });
            observer.observe(resolved.container, {
                attributes: true,
                attributeFilter: ["href"],
                childList: true,
                subtree: true,
            });
            if (resolved.container.parentNode) {
                observer.observe(resolved.container.parentNode, { childList: true });
            }

            observedContainers.set(containerType, {
                container: resolved.container,
                observer,
            });
        })
        .catch(() => undefined)
        .finally(() => pendingContainers.delete(containerType));

    pendingContainers.set(containerType, setup);
}

async function resolveThumbnailContainer(
    containerType: string,
    selector: string
): Promise<ResolvedThumbnailContainer | null> {
    const ready = await waitForThumbnailReady();
    if (!ready || !isContainerTypeActive(containerType)) return null;

    const root = await waitFor(() => getThumbnailRoot(containerType), 10000, 100).catch(() => null);
    if (!root || !isContainerTypeActive(containerType)) return null;

    const container = await waitFor(() => root.querySelector(selector), 10000, 100).catch(() => null);
    if (!container || !root.contains(container)) return null;

    return { container, root };
}

function waitForThumbnailReady(): Promise<boolean> {
    thumbnailReady ??= Promise.all([
        waitFor(getPageLoaded, 35000, 100),
        waitFor(() => Config.isReady(), 35000, 100),
    ])
        .then(() => true)
        .catch(() => false);
    return thumbnailReady;
}

function getThumbnailRoot(containerType: string): Document | ShadowRoot | null {
    if (!isShadowRoot(containerType)) return document;

    const parent = document.querySelector(getParentElement(containerType));
    return parent?.shadowRoot ?? null;
}

function isContainerTypeActive(containerType: string): boolean {
    return (
        listenerActive &&
        getThumbnailContainerElements(getPageType()).some((target) => target.containerType === containerType)
    );
}

function insertShadowRootAssets(root: ShadowRoot): void {
    if (!root.querySelector("link[data-bsb-thumbnail-styles]")) {
        const stylesheet = document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = chrome.runtime.getURL("content.css");
        stylesheet.dataset.bsbThumbnailStyles = "";
        root.appendChild(stylesheet);
    }
    insertSBIconDefinition(root);
}

function labelNewThumbnails(container: Element, containerType: string): void {
    if (!container.isConnected) return;

    const thumbnails = container.querySelectorAll(getThumbnailSelectors(containerType)) as NodeListOf<HTMLElement>;
    thumbnails.forEach((thumbnail) => {
        void labelThumbnail(thumbnail, containerType).catch(() => undefined);
    });
}
