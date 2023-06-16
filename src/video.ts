import { waitFor } from ".";
import { LocalStorage, ProtoConfig, SyncStorage } from "./config";
import { getElement, isVisible, waitForElement } from "./dom";
import { newThumbnails } from "./thumbnailManagement";
import { versionHigher } from "./versionHigher";

const version = "version-number-replaced-by-compiler"

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
export interface ParsedVideoURL {
    videoID: VideoID | null;
    onInvidious: boolean;
    onMobileYouTube: boolean;
    callLater: boolean;
}

interface VideoModuleParams {
    videoIDChange: (videoID: VideoID) => void;
    channelIDChange: (channelIDInfo: ChannelIDInfo) => void;
    videoElementChange?: (newVideo: boolean, video: HTMLVideoElement | null) => void;
    playerInit?: () => void;
    updatePlayerBar?: () => void;
    resetValues: () => void;
    windowListenerHandler?: (event: MessageEvent) => void;
    newVideosLoaded?: (videoIDs: VideoID[]) => void; // Used to pre-cache data for videos
    documentScript: string;
}

let video: HTMLVideoElement | null = null;
let videoMutationObserver: MutationObserver | null = null;
let videoMutationListenerElement: HTMLElement | null = null;
// What videos have run through setup so far
const videosSetup: HTMLVideoElement[] = [];
let waitingForNewVideo = false;

let isAdPlaying = false;
// if video is live or premiere
let isLivePremiere: boolean

let videoID: VideoID | null = null;
let onInvidious: boolean | null = null;
let onMobileYouTube = false;
let pageType: PageType = PageType.Unknown;
let channelIDInfo: ChannelIDInfo;
let waitingForChannelID = false;

let params: VideoModuleParams = {
    videoIDChange: () => {},
    channelIDChange: () => {},
    videoElementChange: () => {},
    playerInit: () => {},
    resetValues: () => {},
    windowListenerHandler: () => {},
    newVideosLoaded: () => {},
    documentScript: ""
};
let getConfig: () => ProtoConfig<SyncStorage, LocalStorage>;
export function setupVideoModule(moduleParams: VideoModuleParams, config: () => ProtoConfig<SyncStorage, LocalStorage>) {
    params = moduleParams;
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

    setupVideoMutationListener();
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

    // Make sure the video is still visible
    if (!isVisible(video)) {
        refreshVideoAttachments();
    }

    resetValues();
    videoID = id;

	//id is not valid
    if (!id) return false;

    // Wait for options to be ready
    await waitFor(() => getConfig().isReady(), 5000, 1);

    // Update whitelist data when the video data is loaded
    whitelistCheck();

    params.videoIDChange(id);

    return true;
}

function resetValues() {
    params.resetValues();

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

/**
 * Parse with side effects
 */
function getYouTubeVideoIDFromURL(url: string): VideoID | null {
    const result = parseYouTubeVideoIDFromURL(url);

    if (result.callLater) {
        // Call this later, in case this is an Invidious tab
        waitFor(() => getConfig().isReady()).then(() => videoIDChange(getYouTubeVideoIDFromURL(url)));

        return null;
    }

    onInvidious = result.onInvidious;
    onMobileYouTube = result.onMobileYouTube;

    return result.videoID;
}

/**
 * Parse without side effects
 */
export function parseYouTubeVideoIDFromURL(url: string): ParsedVideoURL {
    if(url.startsWith("https://www.youtube.com/tv#/")) url = url.replace("#", "");
    let onInvidious = false;
    let onMobileYouTube = false;

    //Attempt to parse url
    let urlObject: URL | null = null;
    try {
        urlObject = new URL(url);
    } catch (e) {
        console.error("[SB] Unable to parse URL: " + url);
        return {
            videoID: null,
            onInvidious,
            onMobileYouTube,
            callLater: false
        };
    }

    // Check if valid hostname
    if (getConfig().isReady() && getConfig().config!.invidiousInstances.includes(urlObject.host)) {
        onInvidious = true;
    } else if (urlObject.host === "m.youtube.com") {
        onMobileYouTube = true;
    } else if (!["m.youtube.com", "www.youtube.com", "www.youtube-nocookie.com", "music.youtube.com"].includes(urlObject.host)) {
        return {
            videoID: null,
            onInvidious,
            onMobileYouTube,
            callLater: !getConfig().isReady() // Might be an Invidious tab
        };
    } else {
        onInvidious = false;
    }

    //Get ID from searchParam
    if (urlObject.searchParams.has("v") && ["/watch", "/watch/"].includes(urlObject.pathname) || urlObject.pathname.startsWith("/tv/watch")) {
        const id = urlObject.searchParams.get("v");
        return {
            videoID: id?.length == 11 ? id as VideoID : null,
            onInvidious,
            onMobileYouTube,
            callLater: false
        };
    } else if (urlObject.pathname.startsWith("/embed/") || urlObject.pathname.startsWith("/shorts/")) {
        try {
            const id = urlObject.pathname.split("/")[2]
            if (id?.length >= 11 ) return {
                videoID: id.slice(0, 11) as VideoID,
                onInvidious,
                onMobileYouTube,
                callLater: false
            };
        } catch (e) {
            console.error("[SB] Video ID not valid for " + url);
            return {
                videoID: null,
                onInvidious,
                onMobileYouTube,
                callLater: false
            };
        }
    }

    return {
        videoID: null,
        onInvidious,
        onMobileYouTube,
        callLater: false
    };
}

//checks if this channel is whitelisted, should be done only after the channelID has been loaded
export async function whitelistCheck() {
    try {
        waitingForChannelID = true;
        await waitFor(() => channelIDInfo.status === ChannelIDStatus.Found, 6000, 20);

        // If found, continue on, it was set by the listener
    } catch (e) {
        // try to get channelID from page-manager
        const pageMangerChannelID = (document.querySelector("ytd-page-manager") as any)?.data?.playerResponse?.videoDetails?.channelId

        // Try fallback
        const channelIDFallback = (document.querySelector("a.ytd-video-owner-renderer") // YouTube
            ?? document.querySelector("a.ytp-title-channel-logo") // YouTube Embed
            ?? document.querySelector(".channel-profile #channel-name")?.parentElement?.parentElement // Invidious
            ?? document.querySelector("a.slim-owner-icon-and-title")) // Mobile YouTube
                ?.getAttribute("href")?.match(/\/(?:(?:channel|c|user|)\/|@)(UC[a-zA-Z0-9_-]{22}|[a-zA-Z0-9_-]+)/)?.[1];

        if (channelIDFallback) {
            channelIDInfo = {
                status: ChannelIDStatus.Found,
                id: (pageMangerChannelID ?? channelIDFallback) as ChannelID
            };
        } else {
            channelIDInfo = {
                status: ChannelIDStatus.Failed,
                id: null
            };
        }
    }

    waitingForChannelID = false;
    params.channelIDChange(channelIDInfo);
}

let lastMutationListenerCheck = 0;
let checkTimeout: NodeJS.Timeout | null = null;
function setupVideoMutationListener() {
    if (!onInvidious 
            && (videoMutationObserver === null || !isVisible(videoMutationListenerElement!.parentElement))) {

        // Delay it if it was checked recently
        if (checkTimeout) clearTimeout(checkTimeout);
        if (Date.now() - lastMutationListenerCheck < 2000) {
            checkTimeout = setTimeout(setupVideoMutationListener, Math.max(1000, Date.now() - lastMutationListenerCheck));
            return;
        }

        lastMutationListenerCheck = Date.now();
        const mainVideoObject = getElement("#movie_player", true);
        if (!mainVideoObject) return;

        const videoContainer = mainVideoObject.querySelector(".html5-video-container") as HTMLElement;
        if (!videoContainer) return;

        if (videoMutationObserver) videoMutationObserver.disconnect();
        videoMutationObserver = new MutationObserver(refreshVideoAttachments);
        videoMutationListenerElement = videoContainer;

        videoMutationObserver.observe(videoContainer, {
            attributes: true,
            childList: true,
            subtree: true
        });
    }
}

async function refreshVideoAttachments(): Promise<void> {
    if (waitingForNewVideo) return;

    waitingForNewVideo = true;
    const newVideo = await waitForElement("video", true) as HTMLVideoElement;
    waitingForNewVideo = false;

    video = newVideo;
    const isNewVideo = !videosSetup.includes(video);

    if (isNewVideo) {
        videosSetup.push(video);
    }

    params.videoElementChange?.(isNewVideo, video);
    setupVideoMutationListener();

    videoIDChange(getYouTubeVideoID());
}

function windowListenerHandler(event: MessageEvent): void {
    const data = event.data;
    const dataType = data.type;

    if (data.source !== "sponsorblock" || document?.URL?.includes("youtube.com/clip/")) return;

    if (dataType === "navigation") {
        newThumbnails();
    }

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
            
            params.updatePlayerBar?.();
        }
    } else if (dataType === "data" && data.videoID) {
        videoIDChange(data.videoID);

        isLivePremiere = data.isLive || data.isPremiere
    } else if (dataType === "newElement") {
        newThumbnails();
    } else if (dataType === "videoIDsLoaded") {
        params.newVideosLoaded?.(data.videoIDs);
    }

    params.windowListenerHandler?.(event);
}

function addPageListeners(): void {
    const refreshListners = () => {
        if (!isVisible(video)) {
            refreshVideoAttachments();
        }
    };

    if (params.documentScript) {
        // inject into document
        const docScript = document.createElement("script");
        docScript.id = "sponsorblock-document-script";
        docScript.setAttribute("version", version)
        docScript.innerHTML = params.documentScript;
        // Not injected on invidious
        const head = (document.head || document.documentElement);
        const existingScript = document.getElementById("sponsorblock-document-script");
        const existingScriptVersion = existingScript?.getAttribute("version");
        if (head && (!existingScript || versionHigher(version, existingScriptVersion ?? ""))) {
            if (existingScript) {
                docScript.setAttribute("teardown", "true");
                existingScript.remove();
            }

            head.appendChild(docScript);
        }
    }

    document.addEventListener("yt-navigate-finish", refreshListners);
    // piped player init
    window.addEventListener("playerInit", () => {
        if (!document.querySelector('meta[property="og:title"][content="Piped"]')) return;
        params.playerInit?.();
    });
    window.addEventListener("message", windowListenerHandler);
}

export function getVideo(): HTMLVideoElement | null {
    setupVideoMutationListener();

    if (!isVisible(video)) {
        void refreshVideoAttachments();
    }

    return video;
}

export function getVideoID(): VideoID | null {
    return videoID;
}

export function isOnInvidious(): boolean | null {
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