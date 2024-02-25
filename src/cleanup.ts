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
        message: getCleanupStartMessage()
    });

    window.addEventListener("message", (message) => {
        if (message.data?.source
                && message.data.source === source
                && message.data.message === getCleanupStartMessage()
                && performance.now() - started > 5000) {

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
    return "cleanup-start"
}

export interface InjectedScript {
    matches?: string[];
    js?: string[];
    css?: string[];
}

export async function injectUpdatedScripts(extraScripts: InjectedScript[] = []) {
    const scripts = extraScripts.concat(chrome.runtime.getManifest().content_scripts || []);
    if ("scripting" in chrome) {
        for (const cs of scripts) {
            for (const tab of await chromeP.tabs.query({url: cs.matches})) {
                if (cs.css && cs.css.length > 0) {
                    await chromeP.scripting.insertCSS({
                        target: {tabId: tab.id!},
                        files: cs.css || [],
                    })
                }

                await chromeP.scripting.executeScript({
                    target: {tabId: tab.id!},
                    files: cs.js || [],

                    world: cs["world"] || "ISOLATED"
                })
            }
        }
    } else {
        chrome.windows.getAll({
            populate: true
        }, (windows) => {
            for (const window of windows) {
                if (window.tabs) {
                    for (const tab of window.tabs) {
                        for (const script of scripts) {
                            if (tab.url && script.matches?.some?.((match) =>
                                    tab.url!.match(match
                                            .replace(/\//g, "\\/")
                                            .replace(/\./g, "\\.")
                                            .replace(/\*/g, ".*")))) {
                                if (script.js) {
                                    void chromeP.scripting.executeScript({
                                        target: { tabId: tab.id! },
                                        files: script.js
                                    });
                                }

                                if (script.css) {
                                    for (const file of script.css) {
                                        void chrome.tabs.insertCSS(tab.id!, {
                                            file
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    }
}