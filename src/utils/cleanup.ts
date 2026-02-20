import { chromeP } from "./browserApi";

const cleanupListeners: (() => void)[] = [];
export function addCleanupListener(listener: () => void) {
    cleanupListeners.push(listener);
}

export function setupCleanupListener() {
    const source = getCleanupId();

    const started = performance.now();
    window.postMessage({
        source,
        message: getCleanupStartMessage(),
    });

    window.addEventListener("message", (message) => {
        if (
            message.data?.source &&
            message.data.source === source &&
            message.data.message === getCleanupStartMessage() &&
            performance.now() - started > 5000
        ) {
            for (const listener of cleanupListeners) {
                listener();
            }
        }
    });
}

export function getCleanupId() {
    return `${chrome.runtime.id}-cleanup`;
}

export function getCleanupStartMessage() {
    return "cleanup-start";
}

export interface InjectedScript {
    matches?: string[];
    js?: string[];
    css?: string[];
}

export async function injectUpdatedScripts(extraScripts: InjectedScript[] = [], ignoreNormalScipts = false) {
    const scripts = ignoreNormalScipts
        ? extraScripts
        : extraScripts.concat(chrome.runtime.getManifest().content_scripts || []);
    if ("scripting" in chrome) {
        for (const cs of scripts) {
            for (const tab of await chromeP.tabs.query({ url: cs.matches })) {
                if (cs.css && cs.css.length > 0) {
                    await chromeP.scripting.insertCSS({
                        target: { tabId: tab.id! },
                        files: cs.css || [],
                    });
                }

                if (cs.js && cs.js.length > 0) {
                    await (chromeP.scripting as typeof chrome.scripting).executeScript({
                        target: { tabId: tab.id! },
                        files: cs.js,
                        world: cs["world"] || "ISOLATED",
                    });
                }
            }
        }
    } else {
        chrome.windows.getAll({ populate: true }, (windows) => {
            for (const window of windows) {
                if (window.tabs) {
                    for (const tab of window.tabs) {
                        for (const script of scripts) {
                            if (
                                tab.url &&
                                script.matches?.some?.((match) =>
                                    tab.url!.match(
                                        match.replace(/\//g, "\\/").replace(/\./g, "\\.").replace(/\*/g, ".*")
                                    )
                                )
                            ) {
                                if (script.js) {
                                    void (chromeP.scripting as typeof chrome.scripting).executeScript({
                                        target: { tabId: tab.id! },
                                        files: script.js,
                                    });
                                }

                                if (script.css) {
                                    void chromeP.scripting.insertCSS({
                                        target: { tabId: tab.id! },
                                        files: script.css,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        });
    }
}

const bsbElementsSelector = [
    "#categoryPill",
    ".playerButton",
    ".sponsorThumbnailLabel",
    "#submissionNoticeContainer",
    ".sponsorSkipNoticeContainer",
    "#sponsorBlockPopupContainer",
    ".skipButtonControlBarContainer",
    "#previewbar",
    "#shadowPreviewbar",
    "#bsbPortButton",
    "#bsbDescriptionContainer",
    "message-notice",
].join(", ");

export function cleanPage() {
    // For live-updates
    if (document.readyState === "complete") {
        for (const element of document.querySelectorAll(bsbElementsSelector)) {
            element.remove();
        }
    }
}
