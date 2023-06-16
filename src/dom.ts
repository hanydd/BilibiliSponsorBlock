export function isVisible(element: HTMLElement | null): boolean {
    if (!element || element.offsetWidth === 0 || element.offsetHeight === 0) {
        return false;
    }

    // Special case for when a video is first loaded, and the main video element is technically hidden
    if (element.tagName === "VIDEO" 
            && element.classList.contains("html5-main-video") 
            && document.querySelectorAll("video").length === 1) {
        return true;
    }

    const boundingRect = element?.getBoundingClientRect();
    const elementAtPoint = document.elementFromPoint(boundingRect.left + boundingRect.width / 2,
        boundingRect.top + boundingRect.height / 2)
        || document.elementFromPoint(boundingRect.left, boundingRect.top);

    if (!elementAtPoint 
            && element.id === "movie_player"
            && boundingRect.top < 0) {
        return true;
    }

    if (elementAtPoint === element || (!!elementAtPoint && element.contains(elementAtPoint))) {
        return true;
    }

    // Hover previews will have their controls appear on top, go back to the nearest player
    // to make sure this is the correct element.
    // If a hover preview is inactive, it will instead have the thumbnail as the top element, which
    // is at a different tree to the video player, so it will properly return false for this.
    if (element.tagName === "VIDEO") {
        return !!elementAtPoint?.closest(".html5-video-player")?.contains(element);
    }

    return false;
}

export function findValidElementFromSelector(selectors: string[]): HTMLElement | null {
    return findValidElementFromGenerator(selectors, (selector) => document.querySelector(selector));
}

export function findValidElement(elements: HTMLElement[] | NodeListOf<HTMLElement>): HTMLElement | null {
    return findValidElementFromGenerator(elements);
}

function findValidElementFromGenerator<T>(objects: T[] | NodeListOf<HTMLElement>, generator?: (obj: T) => HTMLElement | null): HTMLElement | null {
    for (const obj of objects) {
        const element = generator ? generator(obj as T) : obj as HTMLElement;
        if (element && isVisible(element)) {
            return element;
        }
    }

    return null;
}

/* Used for waitForElement */
let creatingWaitingMutationObserver = false;
let waitingMutationObserver: MutationObserver | null = null;
let waitingElements: { selector: string; visibleCheck: boolean; callback: (element: Element) => void }[] = [];

/* Uses a mutation observer to wait asynchronously */
export async function waitForElement(selector: string, visibleCheck = false): Promise<Element> {
    return await new Promise((resolve) => {
        const initialElement = getElement(selector, visibleCheck);
        if (initialElement) {
            resolve(initialElement);
            return;
        }

        waitingElements.push({
            selector,
            visibleCheck,
            callback: resolve
        });

        if (!creatingWaitingMutationObserver) {
            creatingWaitingMutationObserver = true;

            if (document.body) {
                setupWaitingMutationListener();
            } else {
                window.addEventListener("DOMContentLoaded", () => {
                    setupWaitingMutationListener();
                });
            }
        }
    });
}

function setupWaitingMutationListener(): void {
    if (!waitingMutationObserver) {
        const checkForObjects = () => {
            const foundSelectors: string[] = [];
            for (const { selector, visibleCheck, callback } of waitingElements) {
                const element = getElement(selector, visibleCheck);
                if (element) {
                    callback(element);
                    foundSelectors.push(selector);
                }
            }

            waitingElements = waitingElements.filter((element) => !foundSelectors.includes(element.selector));
            
            if (waitingElements.length === 0) {
                waitingMutationObserver?.disconnect();
                waitingMutationObserver = null;
                creatingWaitingMutationObserver = false;
            }
        };

        // Do an initial check over all objects
        checkForObjects();

        if (waitingElements.length > 0) {
            waitingMutationObserver = new MutationObserver(checkForObjects);

            waitingMutationObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }
}

export function getElement(selector: string, visibleCheck: boolean) {
    return visibleCheck ? findValidElement(document.querySelectorAll(selector)) : document.querySelector(selector) as HTMLElement;
}