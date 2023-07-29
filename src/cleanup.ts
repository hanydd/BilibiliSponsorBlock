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

export async function injectUpdatedScripts() {
    if (chrome.runtime.getManifest().manifest_version === 3) {
        for (const cs of chrome.runtime.getManifest().content_scripts!) {
            for (const tab of await chrome.tabs.query({url: cs.matches})) {
                if (cs.css && cs.css.length > 0) {
                    await chrome.scripting.insertCSS({
                        target: {tabId: tab.id!},
                        files: cs.css || [],
                    })
                }
    
                await chrome.scripting.executeScript({
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
                for (const tab of window.tabs) {
                    for (const script of chrome.runtime.getManifest().content_scripts) {
                        if (tab.url && script.matches.some((match) => 
                                tab.url.match(match
                                        .replace(/\//g, "\\/")
                                        .replace(/\./g, "\\.")
                                        .replace(/\*/g, ".*")))) {
                            for (const file of script.js) {
                                chrome.tabs.executeScript(tab.id, {
                                    file
                                });
                            }

                            for (const file of script.css) {
                                chrome.tabs.insertCSS(tab.id, {
                                    file
                                });
                            }
                        }
                    }
                }
            }
        });
    }
}