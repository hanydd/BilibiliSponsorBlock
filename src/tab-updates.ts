import { waitFor } from ".";
import { LocalStorage, ProtoConfig, SyncStorage } from "./config";

function onTabUpdatedListener(tabId: number) {
    chrome.tabs.sendMessage(tabId, {
        message: 'update',
    }, () => void chrome.runtime.lastError ); // Suppress error on Firefox
}

function onNavigationApiAvailableChange(changes: {[key: string]: chrome.storage.StorageChange}) {
    if (changes.navigationApiAvailable) {
        if (changes.navigationApiAvailable.newValue) {
            chrome.tabs.onUpdated.removeListener(onTabUpdatedListener);
        } else {
            chrome.tabs.onUpdated.addListener(onTabUpdatedListener);
        }
    }
}

export function setupTabUpdates<T extends SyncStorage, U extends LocalStorage>(config: ProtoConfig<T, U>) {
    // If Navigation API is not supported, then background has to inform content script about video change.
    // This happens on Safari, Firefox, and Chromium 101 (inclusive) and below.
    chrome.tabs.onUpdated.addListener(onTabUpdatedListener);
    void waitFor(() => config.local !== null).then(() => {
        if (config.local!.navigationApiAvailable) {
            chrome.tabs.onUpdated.removeListener(onTabUpdatedListener);
        }
    });

    if (!config.configSyncListeners.includes(onNavigationApiAvailableChange)) {
        config.configSyncListeners.push(onNavigationApiAvailableChange);
    }
}