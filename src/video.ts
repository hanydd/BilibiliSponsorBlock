import { waitFor } from ".";
import { LocalStorage, ProtoConfig, SyncStorage } from "./config";
import { isVisible, waitForElement } from "./dom";

export enum PageType {
    Unknown = "unknown",
    Shorts = "shorts",
    Watch = "watch",
    Search = "search",
    Browse = "browse",
    Channel = "channel",
    Embed = "embed"
}
export type VideoID = string & { __videoID: never };
export type ChannelID = string & { __channelID: never };
export enum ChannelIDStatus {
    Fetching,
    Found,
    Failed
}
export interface ChannelIDInfo {
    id: ChannelID | null;
    status: ChannelIDStatus;
}

interface Listeners {
    videoIDChange: (videoID: VideoID) => void;
    channelIDChange: (channelIDInfo: ChannelIDInfo) => void;
    videoElementChange?: (newVideo: boolean, video: HTMLVideoElement | null) => void;
    playerInit?: () => void;
    updatePlayerBar?: () => void;
    resetValues: () => void;
}

let video: HTMLVideoElement | null = null;
let videoMutationObserver: MutationObserver | null = null;
// What videos have run through setup so far
const videosSetup: HTMLVideoElement[] = [];
let waitingForNewVideo = false;

let isAdPlaying = false;
// if video is live or premiere
let isLivePremiere: boolean

let videoID: VideoID | null = null;
let onInvidious = false;
let onMobileYouTube = false;
let pageType: PageType = PageType.Unknown;
let channelIDInfo: ChannelIDInfo;
let waitingForChannelID = false;

let listeners: Listeners = {
    videoIDChange: () => {},
    channelIDChange: () => {},
    videoElementChange: () => {},
    playerInit: () => {},
    resetValues: () => {}
};
let getConfig: () => ProtoConfig<SyncStorage, LocalStorage>;
export function setupVideoModule(listenersParam: Listeners, config: () => ProtoConfig<SyncStorage, LocalStorage>) {
    listeners = listenersParam;
    getConfig = config;

    // Direct Links after the config is loaded
    waitFor(() => getConfig().isReady(), 1000, 1).then(() => videoIDChange(getYouTubeVideoID()));

    // wait for hover preview to appear, and refresh attachments if ever found
    waitForElement(".ytp-inline-preview-ui").then(() => refreshVideoAttachments());
    waitForElement("a.ytp-title-link[data-sessionlink='feature=player-title']")
    .then(() => videoIDChange(getYouTubeVideoID()));

    addPageListeners();

    // Register listener for URL change via Navigation API
    const navigationApiAvailable = "navigation" in window;
    if (navigationApiAvailable) {
        // TODO: Remove type cast once type declarations are updated
        (window as unknown as { navigation: EventTarget }).navigation.addEventListener("navigate", (e) =>
            videoIDChange(getYouTubeVideoID((e as unknown as Record<string, Record<string, string>>).destination.url)));
    }
    // Record availability of Navigation API
    waitFor(() => config().local !== null).then(() => {
        if (config().local!.navigationApiAvailable !== navigationApiAvailable) {
            config().local!.navigationApiAvailable = navigationApiAvailable;
            config().forceLocalUpdate("navigationApiAvailable");
        }
    });
}

export async function checkIfNewVideoID(): Promise<boolean> {
    const id = getYouTubeVideoID();

    if (id === videoID) return false;
    return await videoIDChange(id);
}

export async function checkVideoIDChange(): Promise<boolean> {
    const id = getYouTubeVideoID();
    
    return await videoIDChange(id);
}

async function videoIDChange(id: VideoID | null): Promise<boolean> {
    // don't switch to invalid value
    if (!id && videoID && !document?.URL?.includes("youtube.com/clip/")) return false;
    //if the id has not changed return unless the video element has changed
    if (videoID === id && (isVisible(video) || !video)) return false;

    resetValues();
    videoID = id;

	//id is not valid
    if (!id) return false;

    // Wait for options to be ready
    await waitFor(() => getConfig().isReady(), 5000, 1);

    // Update whitelist data when the video data is loaded
    whitelistCheck();

    listeners.videoIDChange(id);

    return true;
}

function resetValues() {
    listeners.resetValues();

    videoID = null;
    pageType = PageType.Unknown;
    channelIDInfo = {
        status: ChannelIDStatus.Fetching,
        id: null
    };
    isLivePremiere = false;

    isAdPlaying = false;
}

export function getYouTubeVideoID(url?: string): VideoID | null {
    url ||= document?.URL;
    // pageType shortcut
    if (pageType === PageType.Channel) return getYouTubeVideoIDFromDocument();
    // clips should never skip, going from clip to full video has no indications.
    if (url.includes("youtube.com/clip/")) return null;
    // skip to document and don't hide if on /embed/
    if (url.includes("/embed/") && url.includes("youtube.com")) return getYouTubeVideoIDFromDocument(false, PageType.Embed);
    // skip to URL if matches youtube watch or invidious or matches youtube pattern
    if ((!url.includes("youtube.com")) || url.includes("/watch") || url.includes("/shorts/") || url.includes("playlist")) return getYouTubeVideoIDFromURL(url);
    // skip to document if matches pattern
    if (url.includes("/channel/") || url.includes("/user/") || url.includes("/c/")) return getYouTubeVideoIDFromDocument(true, PageType.Channel);
    // not sure, try URL then document
    return getYouTubeVideoIDFromURL(url) || getYouTubeVideoIDFromDocument(false);
}

function getYouTubeVideoIDFromDocument(hideIcon = true, pageHint = PageType.Watch): VideoID | null {
    const selector = "a.ytp-title-link[data-sessionlink='feature=player-title']";
    // get ID from document (channel trailer / embedded playlist)
    const element = pageHint === PageType.Embed ? document.querySelector(selector)
        : video?.parentElement?.parentElement?.querySelector(selector);
    const videoURL = element?.getAttribute("href");
    if (videoURL) {
        onInvidious = hideIcon;
        // if href found, hint was correct
        pageType = pageHint;
        return getYouTubeVideoIDFromURL(videoURL);
    } else {
        return null;
    }
}

function getYouTubeVideoIDFromURL(url: string): VideoID | null {
    if(url.startsWith("https://www.youtube.com/tv#/")) url = url.replace("#", "");

    //Attempt to parse url
    let urlObject: URL | null = null;
    try {
        urlObject = new URL(url);
    } catch (e) {
        console.error("[SB] Unable to parse URL: " + url);
        return null;
    }

    // Check if valid hostname
    if (getConfig().isReady() && getConfig().config!.invidiousInstances.includes(urlObject.host)) {
        onInvidious = true;
    } else if (urlObject.host === "m.youtube.com") {
        onMobileYouTube = true;
    } else if (!["m.youtube.com", "www.youtube.com", "www.youtube-nocookie.com", "music.youtube.com"].includes(urlObject.host)) {
        if (!getConfig().isReady()) {
            // Call this later, in case this is an Invidious tab
            waitFor(() => getConfig().isReady()).then(() => videoIDChange(getYouTubeVideoIDFromURL(url)));
        }

        return null;
    } else {
        onInvidious = false;
    }

    //Get ID from searchParam
    if (urlObject.searchParams.has("v") && ["/watch", "/watch/"].includes(urlObject.pathname) || urlObject.pathname.startsWith("/tv/watch")) {
        const id = urlObject.searchParams.get("v");
        return id?.length == 11 ? id as VideoID : null;
    } else if (urlObject.pathname.startsWith("/embed/") || urlObject.pathname.startsWith("/shorts/")) {
        try {
            const id = urlObject.pathname.split("/")[2]
            if (id?.length >= 11 ) return id.slice(0, 11) as VideoID;
        } catch (e) {
            console.error("[SB] Video ID not valid for " + url);
            return null;
        }
    }
    return null;
}

//checks if this channel is whitelisted, should be done only after the channelID has been loaded
export async function whitelistCheck() {
    try {
        waitingForChannelID = true;
        await waitFor(() => channelIDInfo.status === ChannelIDStatus.Found, 6000, 20);

        // If found, continue on, it was set by the listener
    } catch (e) {
        // Try fallback
        const channelIDFallback = (document.querySelector("a.ytd-video-owner-renderer") // YouTube
            ?? document.querySelector("a.ytp-title-channel-logo") // YouTube Embed
            ?? document.querySelector(".channel-profile #channel-name")?.parentElement?.parentElement // Invidious
            ?? document.querySelector("a.slim-owner-icon-and-title")) // Mobile YouTube
                ?.getAttribute("href")?.match(/\/(?:channel|c|user)\/(UC[a-zA-Z0-9_-]{22}|[a-zA-Z0-9_-]+)/)?.[1];

        if (channelIDFallback) {
            channelIDInfo = {
                status: ChannelIDStatus.Found,
                id: channelIDFallback as ChannelID
            };
        } else {
            channelIDInfo = {
                status: ChannelIDStatus.Failed,
                id: null
            };
        }
    }

    waitingForChannelID = false;
    listeners.channelIDChange(channelIDInfo);
}

export function setupVideoMutationListener() {
    const videoContainer = document.querySelector(".html5-video-container");
    if (!videoContainer || videoMutationObserver !== null || onInvidious) return;

    videoMutationObserver = new MutationObserver(refreshVideoAttachments);

    videoMutationObserver.observe(videoContainer, {
        attributes: true,
        childList: true,
        subtree: true
    });
}

export async function refreshVideoAttachments(): Promise<void> {
    if (waitingForNewVideo) return;

    waitingForNewVideo = true;
    const newVideo = await waitForElement("video", true) as HTMLVideoElement;
    waitingForNewVideo = false;

    video = newVideo;
    const isNewVideo = !videosSetup.includes(video);

    if (isNewVideo) {
        videosSetup.push(video);
    }

    listeners.videoElementChange?.(isNewVideo, video);

    videoIDChange(getYouTubeVideoID());
}

function windowListenerHandler(event: MessageEvent): void {
    const data = event.data;
    const dataType = data.type;

    if (data.source !== "sponsorblock" || document?.URL?.includes("youtube.com/clip/")) return;

    if (dataType === "navigation" && data.videoID) {
        pageType = data.pageType;

        if (data.channelID) {
            channelIDInfo = {
                id: data.channelID,
                status: ChannelIDStatus.Found
            };

            if (!waitingForChannelID) {
                whitelistCheck();
            }
        }

        videoIDChange(data.videoID);
    } else if (dataType === "ad") {
        if (isAdPlaying != data.playing) {
            isAdPlaying = data.playing
            
            listeners.updatePlayerBar?.();
        }
    } else if (dataType === "data" && data.videoID) {
        videoIDChange(data.videoID);

        isLivePremiere = data.isLive || data.isPremiere
    }
}

function addPageListeners(): void {
    const refreshListners = () => {
        if (!isVisible(video)) {
            refreshVideoAttachments();
        }
    };

    // inject into document
    const docScript = document.createElement("script");
    docScript.id = "sponsorblock-document-script";
    docScript.src = chrome.runtime.getURL("js/document.js");
    // Not injected on invidious
    const head = (document.head || document.documentElement);
    if (head && document.getElementById("sponsorblock-document-script") === null) {
        head.appendChild(docScript);
    }

    document.addEventListener("yt-navigate-start", resetValues);
    document.addEventListener("yt-navigate-finish", refreshListners);
    // piped player init
    window.addEventListener("playerInit", () => {
        if (!document.querySelector('meta[property="og:title"][content="Piped"]')) return;
        listeners.playerInit?.();
    });
    window.addEventListener("message", windowListenerHandler);
}

export function getVideo(): HTMLVideoElement | null {
    return video;
}

export function getVideoID(): VideoID | null {
    return videoID;
}

export function isOnInvidious(): boolean {
    return onInvidious;
}

export function isOnMobileYouTube(): boolean {
    return onMobileYouTube;
}

export function getWaitingForChannelID(): boolean {
    return waitingForChannelID;
}

export function getChannelIDInfo(): ChannelIDInfo {
    return channelIDInfo;
}

export function getIsAdPlaying(): boolean {
    return isAdPlaying;
}

export function setIsAdPlaying(value: boolean): void {
    isAdPlaying = value;
}

export function getIsLivePremiere(): boolean {
    return isLivePremiere;
}