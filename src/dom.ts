export function isVisible(element: HTMLElement | null, ignoreWidth = false): boolean {
    if (!element) {
        return false;
    }

    // Special case for when a video is first loaded, and the main video element is technically hidden
    if (element.tagName === "VIDEO" 
        && (element.classList.contains("html5-main-video") || element.id === "player" || element.id === "player_html5_api")
        && document.querySelectorAll("video").length === 1) {
        return true;
    }
    
    if (element.offsetHeight === 0 || (element.offsetWidth === 0 && !ignoreWidth)) {
        return false;
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

    if (elementAtPoint === element 
            || (!!elementAtPoint && element.contains(elementAtPoint))
            || (!!elementAtPoint && elementAtPoint.contains(element))) {
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

export function findValidElementFromSelector(selectors: string[], ignoreWidth = false): HTMLElement | null {
    return findValidElementFromGenerator(selectors, ignoreWidth, (selector) => document.querySelector(selector));
}

export function findValidElement(elements: HTMLElement[] | NodeListOf<HTMLElement>, ignoreWidth = false): HTMLElement | null {
    return findValidElementFromGenerator(elements, ignoreWidth);
}

function findValidElementFromGenerator<T>(objects: T[] | NodeListOf<HTMLElement>, ignoreWidth = false, generator?: (obj: T) => HTMLElement | null): HTMLElement | null {
    for (const obj of objects) {
        const element = generator ? generator(obj as T) : obj as HTMLElement;
        if (element && isVisible(element, ignoreWidth)) {
            return element;
        }
    }

    return null;
}

interface WaitingElement {
    selector: string;
    visibleCheck: boolean;
    ignoreWidth: boolean;
    callbacks: Array<(element: Element) => void>;
    elements?: NodeListOf<HTMLElement>;
}

/* Used for waitForElement */
let creatingWaitingMutationObserver = false;
let waitingMutationObserver: MutationObserver | null = null;
let waitingElements: WaitingElement[] = [];

/* Uses a mutation observer to wait asynchronously */
export async function waitForElement(selector: string, visibleCheck = false, ignoreWidth = false): Promise<Element> {
    return await new Promise((resolve) => {
        const initialElement = getElement(selector, visibleCheck, ignoreWidth);
        if (initialElement) {
            resolve(initialElement);
            return;
        }

        const existingWaitingElement = waitingElements.find((waitingElement) => waitingElement.selector === selector 
            && waitingElement.visibleCheck === visibleCheck);

        if (existingWaitingElement) {
            existingWaitingElement.callbacks.push(resolve);
        } else {
            waitingElements.push({
                selector,
                visibleCheck,
                ignoreWidth,
                callbacks: [resolve]
            });
        }

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
        const checkForObjects = (mutations?: MutationRecord[]) => {
            const foundSelectors: string[] = [];
            for (const waitingElement of waitingElements) {
                const { selector, visibleCheck, ignoreWidth, callbacks } = waitingElement;

                let updatePossibleElements = true;
                if (mutations) {
                    let found = false;
                    for (const mutation of mutations) {
                        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
                            if (mutation.target instanceof HTMLElement 
                                    && (mutation.target.matches(selector) || mutation.target.querySelector(selector))) {
                                found = true;
                                break;
                            }

                            for (const node of mutation.addedNodes) {
                                if (node instanceof HTMLElement 
                                        && (node.matches(selector) || node.querySelector(selector))) {
                                    found = true;
                                    break;
                                }
                            }

                            if (found) {
                                break;
                            }
                        }
                    }

                    if (!found) {
                        updatePossibleElements = false;
                    }
                }

                const possibleElements: NodeListOf<HTMLElement> | undefined =
                    updatePossibleElements ? document.querySelectorAll(selector) : waitingElement.elements;
                if (possibleElements && possibleElements.length > 0) {
                    waitingElement.elements = possibleElements;

                    const element = visibleCheck ? findValidElement(possibleElements, ignoreWidth) : possibleElements[0] as HTMLElement;
                    if (element) {
                        if (chrome.runtime?.id) {
                            for (const callback of callbacks) {
                                callback(element);
                            }
                        }

                        foundSelectors.push(selector);
                    }
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

export function getElement(selector: string, visibleCheck: boolean, ignoreWidth = false) {
    return visibleCheck ? findValidElement(document.querySelectorAll(selector), ignoreWidth) : document.querySelector(selector) as HTMLElement;
}