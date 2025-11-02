import * as React from "react";
import { createRoot } from "react-dom/client";

import * as CompileConfig from "../config.json";
import Config from "./config";

// Make the config public for debugging purposes
window.SB = Config;

import KeybindComponent from "./components/options/KeybindComponent";
import { StorageChangesObject } from "./config/config";
import { showDonationLink } from "./config/configUtils";
import { CategoryChooser, DynamicSponsorChooser } from "./render/CategoryChooser";
import { setMessageNotice, showMessage } from "./render/MessageNotice";
import UnsubmittedVideos from "./render/UnsubmittedVideos";
import WhitelistManager from "./render/WhitelistManager";
import { asyncRequestToServer } from "./requests/requests";
import { CacheStats } from "./types";
import { isFirefoxOrSafari, waitFor } from "./utils/";
import { getHash } from "./utils/hash";
import { localizeHtmlPage } from "./utils/setup";

let embed = false;

const categoryChoosers: CategoryChooser[] = [];
const unsubmittedVideos: UnsubmittedVideos[] = [];
const whitelistManagers: WhitelistManager[] = [];

if (document.readyState === "complete") {
    init();
} else {
    document.addEventListener("DOMContentLoaded", init);
}

async function init() {
    await waitFor(() => Config.config !== null, 5000, 10);

    localizeHtmlPage();

    // setup message component
    setMessageNotice(Config.config.darkMode);

    // selected tab
    if (location.hash != "") {
        const substr = location.hash.slice(1);
        let menuItem = document.querySelector(`[data-for='${substr}']`);
        if (menuItem == null) menuItem = document.querySelector(`[data-for='behavior']`);
        menuItem.classList.add("selected");
    } else {
        document.querySelector(`[data-for='behavior']`).classList.add("selected");
    }

    document.getElementById("version").innerText = "v. " + chrome.runtime.getManifest().version;

    // Remove header if needed
    if (window.location.hash === "#embed") {
        embed = true;
        for (const element of document.getElementsByClassName("titleBar")) {
            element.classList.add("hidden");
        }

        document.getElementById("options").classList.add("embed");
        createStickyHeader();
    }

    if (!Config.configSyncListeners.includes(optionsConfigUpdateListener)) {
        Config.configSyncListeners.push(optionsConfigUpdateListener);
    }

    if (!Config.configLocalListeners.includes(optionsLocalConfigUpdateListener)) {
        Config.configLocalListeners.push(optionsLocalConfigUpdateListener);
    }

    await waitFor(() => Config.config !== null);

    if (!Config.config.darkMode) {
        document.documentElement.setAttribute("data-theme", "light");
    }

    const donate = document.getElementById("sbDonate");
    donate.addEventListener("click", () => (Config.config.donateClicked = Config.config.donateClicked + 1));
    if (!showDonationLink()) {
        donate.classList.add("hidden");
    }

    // Set all of the toggle options to the correct option
    const optionsContainer = document.getElementById("options");
    const optionsElements = optionsContainer.querySelectorAll("*");

    for (let i = 0; i < optionsElements.length; i++) {
        const dependentOnName = optionsElements[i].getAttribute("data-dependent-on");
        const dependentOn = optionsContainer.querySelector(`[data-sync='${dependentOnName}']`);
        let isDependentOnReversed = false;
        if (dependentOn)
            isDependentOnReversed =
                dependentOn.getAttribute("data-toggle-type") === "reverse" ||
                optionsElements[i].getAttribute("data-dependent-on-inverted") === "true";

        if (
            (await shouldHideOption(optionsElements[i])) ||
            (dependentOn && (isDependentOnReversed ? Config.config[dependentOnName] : !Config.config[dependentOnName]))
        ) {
            optionsElements[i].classList.add("hidden", "hiding");
            if (!dependentOn) continue;
        }

        const option = optionsElements[i].getAttribute("data-sync");

        switch (optionsElements[i].getAttribute("data-type")) {
            case "toggle": {
                const optionResult = Config.config[option];

                const checkbox = optionsElements[i].querySelector("input");
                const reverse = optionsElements[i].getAttribute("data-toggle-type") === "reverse";

                const confirmMessage = optionsElements[i].getAttribute("data-confirm-message");
                const confirmOnTrue = optionsElements[i].getAttribute("data-confirm-on") !== "false";

                if (optionResult != undefined) checkbox.checked = reverse ? !optionResult : optionResult;

                // Add click listener
                checkbox.addEventListener("click", async () => {
                    // Confirm if required
                    if (
                        confirmMessage &&
                        ((confirmOnTrue && checkbox.checked) || (!confirmOnTrue && !checkbox.checked)) &&
                        !confirm(chrome.i18n.getMessage(confirmMessage))
                    ) {
                        checkbox.checked = !checkbox.checked;
                        return;
                    }

                    Config.config[option] = reverse ? !checkbox.checked : checkbox.checked;

                    // See if anything extra must be run
                    switch (option) {
                        case "disableAutoSkip":
                            if (!checkbox.checked) {
                                // Enable the notice
                                Config.config["dontShowNotice"] = false;

                                const showNoticeSwitch = <HTMLInputElement>(
                                    document.querySelector("[data-sync='dontShowNotice'] > div > label > input")
                                );
                                showNoticeSwitch.checked = true;
                            }
                            break;
                        case "showDonationLink":
                            if (checkbox.checked) document.getElementById("sbDonate").classList.add("hidden");
                            else document.getElementById("sbDonate").classList.remove("hidden");
                            break;
                        case "darkMode":
                            if (checkbox.checked) {
                                document.documentElement.setAttribute("data-theme", "dark");
                            } else {
                                document.documentElement.setAttribute("data-theme", "light");
                            }
                            break;
                        case "trackDownvotes":
                            if (!checkbox.checked) {
                                Config.local.downvotedSegments = {};
                            }
                            break;
                        case "enableCache":
                            if (checkbox.checked) {
                                refreshCacheStats();
                            } else {
                                chrome.runtime.sendMessage({ message: "clearAllCache" });
                            }
                            break;
                    }

                    // If other options depend on this, hide/show them
                    const dependents = optionsContainer.querySelectorAll(`[data-dependent-on='${option}']`);
                    for (let j = 0; j < dependents.length; j++) {
                        const disableWhenChecked = dependents[j].getAttribute("data-dependent-on-inverted") === "true";
                        if (
                            !(await shouldHideOption(dependents[j])) &&
                            ((!disableWhenChecked && checkbox.checked) || (disableWhenChecked && !checkbox.checked))
                        ) {
                            dependents[j].classList.remove("hidden");
                            setTimeout(() => dependents[j].classList.remove("hiding"), 1);
                        } else {
                            dependents[j].classList.add("hiding");
                            setTimeout(() => dependents[j].classList.add("hidden"), 400);
                        }
                    }
                });
                break;
            }
            case "text-change": {
                const textChangeInput = <HTMLInputElement>optionsElements[i].querySelector(".option-text-box");

                const textChangeSetButton = <HTMLElement>optionsElements[i].querySelector(".text-change-set");

                textChangeInput.value = Config.config[option];

                textChangeSetButton.addEventListener("click", async () => {
                    // See if anything extra must be done
                    switch (option) {
                        case "serverAddress": {
                            const result = validateServerAddress(textChangeInput.value);

                            if (result !== null) {
                                textChangeInput.value = result;
                            } else {
                                return;
                            }

                            // Permission needed on Firefox
                            if (isFirefoxOrSafari()) {
                                const permissionSuccess = await new Promise((resolve) => {
                                    chrome.permissions.request(
                                        {
                                            origins: [textChangeInput.value + "/"],
                                            permissions: [],
                                        },
                                        resolve
                                    );
                                });

                                if (!permissionSuccess) return;
                            }

                            break;
                        }
                    }

                    Config.config[option] = textChangeInput.value;
                });

                // Reset to the default if needed
                const textChangeResetButton = <HTMLElement>optionsElements[i].querySelector(".text-change-reset");
                textChangeResetButton.addEventListener("click", () => {
                    if (!confirm(chrome.i18n.getMessage("areYouSureReset"))) return;

                    Config.config[option] = Config.syncDefaults[option];

                    textChangeInput.value = Config.config[option];
                });

                break;
            }
            case "private-text-change": {
                const button = optionsElements[i].querySelector(".trigger-button");
                button.addEventListener("click", () => activatePrivateTextChange(<HTMLElement>optionsElements[i]));

                if (option == "*") {
                    const downloadButton = optionsElements[i].querySelector(".download-button");
                    downloadButton.addEventListener("click", () => downloadConfig(optionsElements[i]));

                    const uploadButton = optionsElements[i].querySelector(".upload-button");
                    uploadButton.addEventListener("change", (e) => uploadConfig(e, optionsElements[i] as HTMLElement));
                }

                break;
            }
            case "button-press": {
                const actionButton = optionsElements[i].querySelector(".trigger-button");
                const confirmMessage = optionsElements[i].getAttribute("data-confirm-message");

                actionButton.addEventListener("click", () => {
                    if (confirmMessage !== null && !confirm(chrome.i18n.getMessage(confirmMessage))) {
                        return;
                    }
                    switch (optionsElements[i].getAttribute("data-sync")) {
                        case "copyDebugInformation":
                            copyDebugOutputToClipboard();
                            break;
                        case "resetToDefault":
                            Config.resetToDefault();
                            setTimeout(() => window.location.reload(), 200);
                            break;
                    }
                });

                break;
            }
            case "keybind-change": {
                const root = createRoot(optionsElements[i].querySelector("div"));
                root.render(React.createElement(KeybindComponent, { option: option }));
                break;
            }
            case "display": {
                updateDisplayElement(<HTMLElement>optionsElements[i]);
                break;
            }
            case "number-change": {
                const configValue = Config.config[option];
                const numberInput = optionsElements[i].querySelector("input");

                if (isNaN(configValue) || configValue < 0) {
                    numberInput.value = Config.syncDefaults[option];
                } else {
                    numberInput.value = configValue;
                }

                numberInput.addEventListener("input", () => {
                    Config.config[option] = numberInput.value;
                });

                break;
            }
            case "selector": {
                const configValue = Config.config[option];
                const selectorElement = optionsElements[i].querySelector(".selector-element") as HTMLSelectElement;
                selectorElement.value = configValue;

                selectorElement.addEventListener("change", () => {
                    let value: string | number = selectorElement.value;
                    if (!isNaN(Number(value))) value = Number(value);

                    const selectedOption = selectorElement.selectedOptions[0];
                    const confirmMessage = selectedOption.getAttribute("data-confirm-message");

                    if (confirmMessage && !confirm(chrome.i18n.getMessage(confirmMessage))) {
                        selectorElement.value = Config.config[option];
                        return;
                    }

                    Config.config[option] = value;
                });
                break;
            }
            case "react-CategoryChooserComponent":
                categoryChoosers.push(new CategoryChooser(optionsElements[i]));
                break;
            case "react-UnsubmittedVideosComponent":
                unsubmittedVideos.push(new UnsubmittedVideos(optionsElements[i]));
                break;
            case "react-DynamicSponsorChooserComponent":
                categoryChoosers.push(new DynamicSponsorChooser(optionsElements[i]));
                break;
            case "react-WhitelistManagerComponent":
                whitelistManagers.push(new WhitelistManager(optionsElements[i]));
                break;
            case "cache-stats": {
                setupCacheManagement(optionsElements[i] as HTMLElement);
                break;
            }
        }
    }

    // Tab interaction
    const tabElements = document.getElementsByClassName("tab-heading");
    for (let i = 0; i < tabElements.length; i++) {
        const tabFor = tabElements[i].getAttribute("data-for");

        if (tabElements[i].classList.contains("selected")) document.getElementById(tabFor).classList.remove("hidden");

        tabElements[i].addEventListener("click", () => {
            if (!embed) location.hash = tabFor;

            createStickyHeader();

            document.querySelectorAll(".tab-heading").forEach((element) => {
                element.classList.remove("selected");
            });
            optionsContainer.querySelectorAll(".option-group").forEach((element) => {
                element.classList.add("hidden");
            });

            tabElements[i].classList.add("selected");
            document.getElementById(tabFor).classList.remove("hidden");
        });
    }

    window.addEventListener("scroll", () => createStickyHeader());

    optionsContainer.classList.add("animated");
}

function createStickyHeader() {
    const container = document.getElementById("options-container");
    const options = document.getElementById("options");

    if (!embed && window.pageYOffset > 90 && (window.innerHeight <= 770 || window.innerWidth <= 1200)) {
        if (!container.classList.contains("sticky")) {
            options.style.marginTop = options.offsetTop.toString() + "px";
            container.classList.add("sticky");
        }
    } else {
        options.style.marginTop = "unset";
        container.classList.remove("sticky");
    }
}

/**
 * Handle special cases where an option shouldn't show
 *
 * @param {String} element
 */
async function shouldHideOption(element: Element): Promise<boolean> {
    return (
        (element.getAttribute("data-private-only") === "true" && !(await isIncognitoAllowed())) ||
        (element.getAttribute("data-no-safari") === "true" && navigator.vendor === "Apple Computer, Inc.")
    );
}

/**
 * Called when the config is updated
 */
function optionsConfigUpdateListener(changes: StorageChangesObject) {
    const optionsContainer = document.getElementById("options");
    const optionsElements = optionsContainer.querySelectorAll("*");

    for (let i = 0; i < optionsElements.length; i++) {
        switch (optionsElements[i].getAttribute("data-type")) {
            case "display":
                updateDisplayElement(<HTMLElement>optionsElements[i]);
                break;
        }
    }

    if (changes.categorySelections || changes.payments) {
        for (const chooser of categoryChoosers) {
            chooser.update();
        }
    }

    if (changes.whitelistedChannels) {
        for (const manager of whitelistManagers) {
            manager.update();
        }
    }
}

function optionsLocalConfigUpdateListener(changes: StorageChangesObject) {
    if (changes.unsubmittedSegments) {
        for (const chooser of unsubmittedVideos) {
            chooser.update();
        }
    }
}

/**
 * Will set display elements to the proper text
 *
 * @param element
 */
function updateDisplayElement(element: HTMLElement) {
    const displayOption = element.getAttribute("data-sync");
    const displayText = Config.config[displayOption];
    element.innerText = displayText;
}

/**
 * Will trigger the textbox to appear to be able to change an option's text.
 *
 * @param element
 */
function activatePrivateTextChange(element: HTMLElement) {
    const button = element.querySelector(".trigger-button");
    if (button.classList.contains("disabled")) return;

    button.classList.add("disabled");

    const textBox = <HTMLInputElement>element.querySelector(".option-text-box");
    const option = element.getAttribute("data-sync");
    const optionType = element.getAttribute("data-sync-type");

    // See if anything extra must be done
    switch (option) {
        case "invidiousInstances":
            element.querySelector(".option-hidden-section").classList.remove("hidden");
            return;
    }

    let result = Config.config[option];
    // See if anything extra must be done
    switch (option) {
        case "*": {
            if (optionType === "local") {
                result = JSON.stringify(Config.cachedLocalStorage);
            } else {
                result = JSON.stringify(Config.cachedSyncConfig);
            }
            break;
        }
    }

    textBox.value = result;

    const setButton = element.querySelector(".text-change-set");
    setButton.addEventListener("click", async () => {
        setTextOption(option, element, textBox.value);
    });

    // See if anything extra must be done
    switch (option) {
        case "userID":
            if (Config.config[option]) {
                asyncRequestToServer("GET", "/api/userInfo", {
                    publicUserID: getHash(Config.config[option]),
                    values: ["warnings", "banned"],
                }).then((result) => {
                    const userInfo = JSON.parse(result.responseText);
                    if (userInfo.warnings > 0 || userInfo.banned) {
                        setButton.classList.add("hidden");
                    }
                });
            }

            break;
    }

    element.querySelector(".option-hidden-section").classList.remove("hidden");
}

/**
 * Function to run when a textbox change is submitted
 *
 * @param option data-sync value
 * @param element main container div
 * @param value new text
 * @param callbackOnError function to run if confirmMessage was denied
 */
async function setTextOption(option: string, element: HTMLElement, value: string, callbackOnError?: () => void) {
    const confirmMessage = element.getAttribute("data-confirm-message");
    const optionType = element.getAttribute("data-sync-type");

    if (confirmMessage === null || confirm(chrome.i18n.getMessage(confirmMessage))) {
        // See if anything extra must be done
        switch (option) {
            case "*":
                try {
                    const newConfig = JSON.parse(value);
                    for (const key in newConfig) {
                        if (optionType === "local") {
                            Config.local[key] = newConfig[key];
                        } else {
                            Config.config[key] = newConfig[key];
                        }
                    }

                    setTimeout(() => window.location.reload(), 200);
                } catch (e) {
                    showMessage(chrome.i18n.getMessage("incorrectlyFormattedOptions", "error"));
                }

                break;
            default:
                Config.config[option] = value;
        }
    } else {
        if (typeof callbackOnError == "function") callbackOnError();
    }
}

function downloadConfig(element: Element) {
    const optionType = element.getAttribute("data-sync-type");

    const file = document.createElement("a");
    const jsonData = JSON.parse(
        JSON.stringify(optionType === "local" ? Config.cachedLocalStorage : Config.cachedSyncConfig)
    );
    const dateTimeString = new Date().toJSON().replace("T", "_").replace(/:/g, ".").replace(/.\d+Z/g, "");
    file.setAttribute("href", `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(jsonData))}`);
    file.setAttribute(
        "download",
        `BilibiliSponsorBlock${optionType === "local" ? "OtherData" : "Config"}_${dateTimeString}.json`
    );
    document.body.append(file);
    file.click();
    file.remove();
}

function uploadConfig(e: Event, element: HTMLElement) {
    const target = e.target as HTMLInputElement;
    if (target.files.length == 1) {
        const file = target.files[0];
        const reader = new FileReader();
        reader.onload = function (ev) {
            setTextOption("*", element, ev.target.result as string, () => {
                target.value = null;
            });
        };
        reader.readAsText(file);
    }
}

/**
 * Validates the value used for the database server address.
 * Returns null and alerts the user if there is an issue.
 *
 * @param input Input server address
 */
function validateServerAddress(input: string): string {
    input = input.trim();

    // Trim the trailing slashes
    input = input.replace(/\/+$/, "");

    // If it isn't HTTP protocol
    if (!input.startsWith("https://") && !input.startsWith("http://")) {
        showMessage(chrome.i18n.getMessage("customAddressError", "error"));

        return null;
    }

    return input;
}

function copyDebugOutputToClipboard() {
    // Build output debug information object
    const output = {
        debug: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            extensionVersion: chrome.runtime.getManifest().version,
        },
        config: JSON.parse(JSON.stringify(Config.cachedSyncConfig)), // Deep clone config object
    };

    // Sanitise sensitive user config values
    delete output.config.userID;
    output.config.serverAddress =
        output.config.serverAddress === CompileConfig.serverAddress
            ? "Default server address"
            : "Custom server address";
    output.config.invidiousInstances = output.config.invidiousInstances.length;
    output.config.whitelistedChannels = output.config.whitelistedChannels.length;

    // Copy object to clipboard
    navigator.clipboard
        .writeText(JSON.stringify(output, null, 4))
        .then(() => {
            showMessage(chrome.i18n.getMessage("copyDebugInformationComplete"), "success");
        })
        .catch(() => {
            showMessage(chrome.i18n.getMessage("copyDebugInformationFailed"), "error");
        });
}

function isIncognitoAllowed(): Promise<boolean> {
    return new Promise((resolve) => chrome.extension.isAllowedIncognitoAccess(resolve));
}

/**
 * Setup cache management functionality
 */
function setupCacheManagement(element: HTMLElement) {
    const refreshButton = element.querySelector("#refreshCacheStats") as HTMLElement;
    const clearButton = element.querySelector("#clearAllCache") as HTMLElement;

    // Initial cache stats load
    refreshCacheStats();

    // Setup refresh button
    refreshButton?.addEventListener("click", refreshCacheStats);

    // Setup clear button with confirmation
    clearButton?.addEventListener("click", () => {
        const confirmMessage = clearButton.getAttribute("data-confirm-message");
        if (confirmMessage && !confirm(chrome.i18n.getMessage(confirmMessage))) {
            return;
        }
        clearAllCache();
    });
}

/**
 * Refresh cache statistics display
 */
function refreshCacheStats() {
    // Only refresh if cache is enabled
    if (!Config.config?.enableCache) {
        updateCacheStatsDisplay({
            segments: { entryCount: 0, sizeBytes: 0, dailyStats: { date: "", hits: 0, sizeBytes: 0 } },
            videoLabels: { entryCount: 0, sizeBytes: 0, dailyStats: { date: "", hits: 0, sizeBytes: 0 } },
        });
        return;
    }

    chrome.runtime.sendMessage({ message: "getCacheStats" }, (response) => {
        if (response?.stats) {
            updateCacheStatsDisplay(response.stats);
        } else {
            // Show error or default values
            updateCacheStatsDisplay({
                segments: {
                    entryCount: 0,
                    sizeBytes: 0,
                    dailyStats: { date: "", hits: 0, sizeBytes: 0 },
                },
                videoLabels: {
                    entryCount: 0,
                    sizeBytes: 0,
                    dailyStats: { date: "", hits: 0, sizeBytes: 0 },
                },
            });
        }
    });
}

/**
 * Clear all cache and refresh display
 */
function clearAllCache() {
    chrome.runtime.sendMessage({ message: "clearAllCache" }, (response) => {
        if (response?.ok) {
            showMessage(chrome.i18n.getMessage("clearAllCacheSuccess"), "success");
            refreshCacheStats(); // Refresh display after clearing
        } else {
            showMessage(chrome.i18n.getMessage("clearAllCacheFailed"), "error");
        }
    });
}

/**
 * Update cache statistics in the UI
 */
function updateCacheStatsDisplay(stats: { segments: CacheStats; videoLabels: CacheStats }) {
    const segmentSizeElement = document.getElementById("segmentCacheSize");
    const segmentEntriesElement = document.getElementById("segmentCacheEntries");
    const segmentHitsElement = document.getElementById("segmentCacheHits");
    const segmentDataRetrievedElement = document.getElementById("segmentCacheDataRetrieved");

    const videoLabelSizeElement = document.getElementById("videoLabelCacheSize");
    const videoLabelEntriesElement = document.getElementById("videoLabelCacheEntries");
    const videoLabelHitsElement = document.getElementById("videoLabelCacheHits");
    const videoLabelDataRetrievedElement = document.getElementById("videoLabelCacheDataRetrieved");

    const totalSizeElement = document.getElementById("totalCacheSize");
    const totalEntriesElement = document.getElementById("totalCacheEntries");
    const totalHitsElement = document.getElementById("totalCacheHits");
    const totalDataRetrievedElement = document.getElementById("totalCacheDataRetrieved");

    if (segmentSizeElement) {
        const sizeKB = Math.round(stats.segments.sizeBytes / 1024);
        segmentSizeElement.textContent = sizeKB.toString();
    }

    if (segmentEntriesElement) {
        segmentEntriesElement.textContent = stats.segments.entryCount.toString();
    }

    if (segmentHitsElement) {
        segmentHitsElement.textContent = stats.segments.dailyStats?.hits.toString();
    }

    if (segmentDataRetrievedElement) {
        segmentDataRetrievedElement.textContent = Math.round(stats.segments.dailyStats?.sizeBytes / 1024).toString();
    }

    if (videoLabelEntriesElement) {
        videoLabelEntriesElement.textContent = stats.videoLabels.entryCount.toString();
    }

    if (videoLabelSizeElement) {
        const sizeKB = Math.round(stats.videoLabels.sizeBytes / 1024);
        videoLabelSizeElement.textContent = sizeKB.toString();
    }

    if (videoLabelHitsElement) {
        videoLabelHitsElement.textContent = stats.videoLabels.dailyStats?.hits.toString();
    }

    if (videoLabelDataRetrievedElement) {
        videoLabelDataRetrievedElement.textContent = Math.round(
            stats.videoLabels.dailyStats?.sizeBytes / 1024
        ).toString();
    }

    if (videoLabelEntriesElement) {
        videoLabelEntriesElement.textContent = stats.videoLabels.entryCount.toString();
    }

    if (totalSizeElement) {
        const totalKB = Math.round((stats.segments.sizeBytes + stats.videoLabels.sizeBytes) / 1024);
        totalSizeElement.textContent = totalKB.toString();
    }

    if (totalEntriesElement) {
        totalEntriesElement.textContent = (stats.segments.entryCount + stats.videoLabels.entryCount).toString();
    }

    if (totalHitsElement) {
        totalHitsElement.textContent = (
            stats.segments.dailyStats?.hits + stats.videoLabels.dailyStats?.hits
        ).toString();
    }

    if (totalDataRetrievedElement) {
        totalDataRetrievedElement.textContent = Math.round(
            (stats.segments.dailyStats?.sizeBytes + stats.videoLabels.dailyStats?.sizeBytes) / 1024
        ).toString();
    }
}
