import "content-scripts-register-polyfill";
import Config from "./config";
import { sendRealRequestToCustomServer } from "./requests/background-request-proxy";
import { clearAllCacheBackground, segmentsCache, videoLabelCache } from "./requests/background/backgroundCache";
import { getSegmentsBackground } from "./requests/background/segmentRequest";
import { getVideoLabelBackground } from "./requests/background/videoLabelRequest";
import { submitVote } from "./requests/background/voteRequest";
import { CacheStats, NewVideoID, Registration } from "./types";
import { chromeP } from "./utils/browserApi";
import { getHash } from "./utils/hash";
import { generateUserID } from "./utils/setup";
import { setupTabUpdates } from "./utils/tab-updates";

const popupPort: Record<string, chrome.runtime.Port> = {};

// Used only on Firefox, which does not support non persistent background pages.
const contentScriptRegistrations = {};

setupBackgroundRequestProxy();
setupTabUpdates(Config);

chrome.runtime.onMessage.addListener(function (request, sender, callback) {
    switch (request.message) {
        case "openConfig":
            chrome.tabs.create({
                url: chrome.runtime.getURL("options/options.html" + (request.hash ? "#" + request.hash : "")),
            });
            return false;
        case "openHelp":
            chrome.tabs.create({ url: chrome.runtime.getURL("help/index.html") });
            return false;
        case "openPage":
            chrome.tabs.create({ url: chrome.runtime.getURL(request.url) });
            return false;
        case "registerContentScript":
            registerFirefoxContentScript(request);
            return false;
        case "unregisterContentScript":
            unregisterFirefoxContentScript(request.id);
            return false;
        case "tabs": {
            chrome.tabs.query(
                {
                    active: true,
                    currentWindow: true,
                },
                (tabs) => {
                    chrome.tabs.sendMessage(tabs[0].id, request.data, (response) => {
                        callback(response);
                    });
                }
            );
            return true;
        }
        case "time":
        case "infoUpdated":
        case "videoChanged":
            if (sender.tab) {
                try {
                    popupPort[sender.tab.id]?.postMessage(request);
                } catch (e) {
                    // This can happen if the popup is closed
                }
            }
            return false;
        default:
            return false;
    }
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "popup") {
        chrome.tabs.query(
            {
                active: true,
                currentWindow: true,
            },
            (tabs) => {
                popupPort[tabs[0].id] = port;
            }
        );
    }
});

//add help page on install
chrome.runtime.onInstalled.addListener(function () {
    // This let's the config sync to run fully before checking.
    // This is required on Firefox
    setTimeout(async () => {
        const userID = Config.config.userID;

        // If there is no userID, then it is the first install.
        if (!userID && !Config.local.alreadyInstalled) {
            //open up the install page
            chrome.tabs.create({ url: chrome.runtime.getURL("/help/index.html") });

            //generate a userID
            const newUserID = generateUserID();
            //save this UUID
            Config.config.userID = newUserID;
            Config.local.alreadyInstalled = true;

            // Don't show update notification
            Config.config.categoryPillUpdate = true;
        }
    }, 1500);
});

/**
 * Only works on Firefox.
 * Firefox requires that it be applied after every extension restart.
 *
 * @param {JSON} options
 */
async function registerFirefoxContentScript(options: Registration) {
    if ("scripting" in chrome && "getRegisteredContentScripts" in chrome.scripting) {
        const existingRegistrations = await chromeP.scripting
            .getRegisteredContentScripts({
                ids: [options.id],
            })
            .catch(() => []);

        if (
            existingRegistrations &&
            existingRegistrations.length > 0 &&
            options.matches.every((match) => existingRegistrations[0].matches.includes(match))
        ) {
            // No need to register another script, already registered
            return;
        }
    }

    await unregisterFirefoxContentScript(options.id);

    if ("scripting" in chrome && "getRegisteredContentScripts" in chrome.scripting) {
        await chromeP.scripting.registerContentScripts([
            {
                id: options.id,
                runAt: "document_start",
                matches: options.matches,
                allFrames: options.allFrames,
                js: options.js,
                css: options.css,
                persistAcrossSessions: true,
            },
        ]);
    } else {
        chrome.contentScripts
            .register({
                allFrames: options.allFrames,
                js: options.js?.map?.((file) => ({ file })),
                css: options.css?.map?.((file) => ({ file })),
                matches: options.matches,
            })
            .then((registration) => void (contentScriptRegistrations[options.id] = registration));
    }
}

/**
 * Only works on Firefox.
 * Firefox requires that this is handled by the background script
 */
async function unregisterFirefoxContentScript(id: string) {
    if ("scripting" in chrome && "getRegisteredContentScripts" in chrome.scripting) {
        try {
            await chromeP.scripting.unregisterContentScripts({
                ids: [id],
            });
        } catch (e) {
            // Not registered yet
        }
    } else {
        if (contentScriptRegistrations[id]) {
            contentScriptRegistrations[id].unregister();
            delete contentScriptRegistrations[id];
        }
    }
}

function setupBackgroundRequestProxy() {
    chrome.runtime.onMessage.addListener((request, sender, callback) => {
        if (request.message === "sendRequest") {
            sendRealRequestToCustomServer(request.type, request.url, request.data, request.headers)
                .then(callback)
                .catch(() => {
                    callback({ responseText: "", status: -1, ok: false });
                });
            return true;
        }

        if (request.message === "getHash") {
            getHash(request.value, request.times)
                .then(callback)
                .catch((e) => {
                    callback({ error: e?.message });
                });
            return true;
        }

        // ============ Request Handlers ============
        if (request.message === "getVideoLabel") {
            getVideoLabelBackground(request.videoID as NewVideoID, Boolean(request.refreshCache))
                .then((category) => callback({ category }))
                .catch(() => callback({ category: null }));
            return true;
        }

        if (request.message === "getSegments") {
            getSegmentsBackground(
                request.videoID as NewVideoID,
                (request.extraRequestData as Record<string, unknown>) || {},
                Boolean(request.ignoreCache)
            )
                .then((response) => callback({ response }))
                .catch(() => callback({ response: { segments: null, status: -1 } }));
            return true;
        }

        if (request.message === "submitVote") {
            submitVote(request.type, request.UUID, request.category).then(callback);
            return true;
        }

        // ============ Cache Management Handlers ============
        if (request.message === "getCacheStats") {
            getCacheStatsBackground()
                .then((stats) => callback({ stats }))
                .catch(() => callback({ stats: null }));
            return true;
        }

        if (request.message === "clearAllCache") {
            clearAllCacheBackground()
                .then(() => callback({ ok: true }))
                .catch(() => callback({ ok: false }));
            return true;
        }

        return false;
    });
}

/**
 * Get cache statistics for segments and video labels caches
 */
async function getCacheStatsBackground(): Promise<{ segments: CacheStats; videoLabels: CacheStats }> {
    const segmentStats = segmentsCache.getCacheStats();
    const videoLabelStats = videoLabelCache.getCacheStats();

    return {
        segments: segmentStats,
        videoLabels: videoLabelStats,
    };
}
