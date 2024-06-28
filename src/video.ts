import { waitFor } from ".";
import { LocalStorage, ProtoConfig, SyncStorage, isSafari } from "./config";
import { getElement, isVisible, waitForElement } from "./dom";
import { newThumbnails } from "./thumbnailManagement";
import { BILI_DOMAINS } from "./const";
import { addCleanupListener, setupCleanupListener } from "./cleanup";
import { injectScript } from "./scriptInjector";

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
    allowClipPage?: boolean;
}

const embedTitleSelector = "h1.video-title";

let video: HTMLVideoElement | null = null;
let videoMutationObserver: MutationObserver | null = null;
let videoMutationListenerElement: HTMLElement | null = null;
// What videos have run through setup so far
const videosSetup: HTMLVideoElement[] = [];
let waitingForNewVideo = false;

// if video is live or premiere
let isLivePremiere: boolean

let videoID: VideoID | null = null;
let pageType: PageType = PageType.Unknown;
let channelIDInfo: ChannelIDInfo;
let waitingForChannelID = false;

let params: VideoModuleParams = {
    videoIDChange: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    channelIDChange: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    videoElementChange: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    playerInit: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    resetValues: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    windowListenerHandler: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    newVideosLoaded: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    documentScript: "",
    allowClipPage: false
};
let getConfig: () => ProtoConfig<SyncStorage, LocalStorage>;
export function setupVideoModule(moduleParams: VideoModuleParams, config: () => ProtoConfig<SyncStorage, LocalStorage>) {
    params = moduleParams;
    getConfig = config;

    setupCleanupListener();

    // Direct Links after the config is loaded
    void waitFor(() => getConfig().isReady(), 1000, 1).then(() => videoIDChange(getBilibiliVideoID()));

    // Can't use onInvidious at this point, the configuration might not be ready.
    //TODO: What does this wait for?
    if (BILI_DOMAINS.includes(location.host)) {
        waitForElement(embedTitleSelector)
            .then((e) => waitFor(() => e.getAttribute("href")))
            .then(() => videoIDChange(getBilibiliVideoID()))
            // Ignore if not an embed
            .catch(() => {}); // eslint-disable-line @typescript-eslint/no-empty-function
    }

    addPageListeners();

    // Register listener for URL change via Navigation API
    const navigationApiAvailable = "navigation" in window;
    if (navigationApiAvailable) {
        // TODO: Remove type cast once type declarations are updated
        const navigationListener = (e) =>
            void videoIDChange(getBilibiliVideoID((e as unknown as Record<string, Record<string, string>>).destination.url));
        (window as unknown as { navigation: EventTarget }).navigation.addEventListener("navigate", navigationListener);

        addCleanupListener(() => {
            (window as unknown as { navigation: EventTarget }).navigation.removeEventListener("navigate", navigationListener);
        });
    }
    // Record availability of Navigation API
    void waitFor(() => config().local !== null).then(() => {
        if (config().local!.navigationApiAvailable !== navigationApiAvailable) {
            config().local!.navigationApiAvailable = navigationApiAvailable;
            config().forceLocalUpdate("navigationApiAvailable");
        }
    });

    setupVideoMutationListener();

    addCleanupListener(() => {
        if (videoMutationObserver) {
            videoMutationObserver.disconnect();
            videoMutationObserver = null;
        }
    });
}

export async function checkIfNewVideoID(): Promise<boolean> {
    const id = getBilibiliVideoID();

    if (id === videoID) return false;
    return await videoIDChange(id);
}

export async function checkVideoIDChange(): Promise<boolean> {
    const id = getBilibiliVideoID();

    return await videoIDChange(id);
}

async function videoIDChange(id: VideoID | null): Promise<boolean> {
    // don't switch to invalid value
    if (!id && videoID) {
        return false;
    }

    //if the id has not changed return unless the video element has changed
    if (videoID === id && (isVisible(video) || !video)) return false;

    // Make sure the video is still visible
    if (!isVisible(video)) {
        void refreshVideoAttachments();
    }

    resetValues();
    videoID = id;

	//id is not valid
    if (!id) return false;

    // Wait for options to be ready
    await waitFor(() => getConfig().isReady(), 5000, 1);

    // Update whitelist data when the video data is loaded
    void whitelistCheck();

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

    // Reset the last media session link
    window.postMessage({
        type: "sb-reset-media-session-link",
        videoID: null
    }, "/");
}

export function getBilibiliVideoID(url?: string): VideoID | null {
    url ||= document?.URL;

    // video page
    if (url.includes("bilibili.com/video")) {
        return getBvIDFromWindow() ?? getBvIDFromURL(url);
    }
    return null
}

function getBvIDFromWindow(): VideoID | null {
    return (window as any)?.__INITIAL_STATE__?.videoData?.bvid
}

/**
 * Parse without side effects
 */
export function getBvIDFromURL(url: string): VideoID | null {
    //Attempt to parse url
    let urlObject: URL | null = null;
    try {
        urlObject = new URL(url);
    } catch (e) {
        console.error("[SB] Unable to parse URL: " + url);
        return null;
    }

    // Check if valid hostname
    if (!BILI_DOMAINS.includes(urlObject.host)) {
        return null;
    }

    // Get ID from url
    // video BV id
    if (urlObject.host == "www.bilibili.com" && urlObject.pathname.startsWith("/video/")) {
        const id = urlObject.pathname.replace("/video/", "").replace("/", "");
        return (id?.length == 12 && id?.startsWith("BV")) ? id as VideoID : null;
    }

    return null;
}


// function getYouTubeVideoIDFromDocument(hideIcon = true, pageHint = PageType.Watch): VideoID | null {
//     // get ID from document (channel trailer / embedded playlist)
//     const element = pageHint === PageType.Embed ? document.querySelector(embedTitleSelector)
//         : video?.parentElement?.parentElement?.querySelector(embedTitleSelector);
//     const videoURL = element?.getAttribute("href");
//     if (videoURL) {
//         onInvidious = hideIcon;
//         // if href found, hint was correct
//         pageType = pageHint;
//         return getYouTubeVideoIDFromURL(videoURL);
//     } else {
//         return null;
//     }
// }

//checks if this channel is whitelisted, should be done only after the channelID has been loaded
export async function whitelistCheck() {
    // TODO: find a route event in Bilibli

    // Try fallback
    // Bilibili watch page
    const channelNameCard = await Promise.race([
        waitForElement("div.membersinfo-upcard > a.avatar"), // collab video with multiple up
        waitForElement("a.up-name")]);
    const channelIDFallback = channelNameCard
        // TODO: more types of pages?
        // ?? document.querySelector("a.ytp-title-channel-logo") // YouTube Embed
            ?.getAttribute("href")?.match(/(?:space\.bilibili\.com\/)([1-9][0-9]{0,11})/)?.[1];

    if (channelIDFallback) {
        channelIDInfo = {
            status: ChannelIDStatus.Found,
            // id: (pageMangerChannelID ?? channelIDFallback) as ChannelID
            id: (channelIDFallback) as ChannelID
        };
    } else {
        channelIDInfo = {
            status: ChannelIDStatus.Failed,
            id: null
        };
    }
    // }

    waitingForChannelID = false;
    params.channelIDChange(channelIDInfo);
}

let lastMutationListenerCheck = 0;
let checkTimeout: NodeJS.Timeout | null = null;
function setupVideoMutationListener() {
    if (videoMutationObserver === null || !isVisible(videoMutationListenerElement!.parentElement)) {

        // Delay it if it was checked recently
        if (checkTimeout) clearTimeout(checkTimeout);
        if (Date.now() - lastMutationListenerCheck < 2000) {
            checkTimeout = setTimeout(setupVideoMutationListener, Math.max(1000, Date.now() - lastMutationListenerCheck));
            return;
        }

        lastMutationListenerCheck = Date.now();
        const mainVideoObject = getElement("#bilibili-player", true);
        if (!mainVideoObject) return;

        const videoContainer = mainVideoObject.querySelector(".bpx-player-video-wrap") as HTMLElement;
        if (!videoContainer) return;

        if (videoMutationObserver) videoMutationObserver.disconnect();
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        videoMutationObserver = new MutationObserver(refreshVideoAttachments);
        videoMutationListenerElement = videoContainer;

        videoMutationObserver.observe(videoContainer, {
            attributes: true,
            childList: true,
            subtree: true
        });
    }
}

// Used only for embeds to wait until the url changes
let embedLastUrl = "";
let waitingForEmbed = false;

async function refreshVideoAttachments(): Promise<void> {
    if (waitingForNewVideo) return;

    waitingForNewVideo = true;
    // Compatibility for Vinegar extension
    const newVideo = (isSafari() && document.querySelector('video[vinegared="true"]') as HTMLVideoElement)
        || await waitForElement("video", true) as HTMLVideoElement;
    waitingForNewVideo = false;

    if (video === newVideo) return;

    video = newVideo;
    const isNewVideo = !videosSetup.includes(video);

    if (isNewVideo) {
        videosSetup.push(video);
    }

    params.videoElementChange?.(isNewVideo, video);
    setupVideoMutationListener();

    if (document.URL.includes("/embed/")) {
        if (waitingForEmbed) {
            return;
        }
        waitingForEmbed = true;

        const waiting = waitForElement(embedTitleSelector)
            .then((e) => waitFor(() => e, undefined, undefined, (e) => e.getAttribute("href") !== embedLastUrl
                && !!e.getAttribute("href") && !!e.textContent));

        void waiting.catch(() => waitingForEmbed = false);
        void waiting.then((e) => embedLastUrl = e.getAttribute("href")!)
            .then(() => waitingForEmbed = false)
            .then(() => videoIDChange(getBilibiliVideoID()));
    } else {
        void videoIDChange(getBilibiliVideoID());
    }
}

function windowListenerHandler(event: MessageEvent): void {
    const data = event.data;
    const dataType = data.type;

    if (data.source !== "sponsorblock") return;

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
                void whitelistCheck();
            }
        }

        void videoIDChange(data.videoID);
    } else if (dataType === "data" && data.videoID) {
        void videoIDChange(data.videoID);

        isLivePremiere = data.isLive || data.isPremiere
    } else if (dataType === "newElement") {
        newThumbnails();
    } else if (dataType === "videoIDsLoaded") {
        params.newVideosLoaded?.(data.videoIDs);
    }

    params.windowListenerHandler?.(event);
}

function addPageListeners(): void {
    const refreshListeners = () => {
        if (!isVisible(video)) {
            void refreshVideoAttachments();
        }
    };

    if (params.documentScript) {
        injectScript(params.documentScript);
    }

    document.addEventListener("yt-navigate-finish", refreshListeners);
    // piped player init
    const playerInitListener = () => {
        if (!document.querySelector('meta[property="og:title"][content="Piped"]')) return;
        params.playerInit?.();
    };
    window.addEventListener("playerInit", playerInitListener);
    window.addEventListener("message", windowListenerHandler);

    addCleanupListener(() => {
        document.removeEventListener("yt-navigate-finish", refreshListeners);
        window.removeEventListener("playerInit", playerInitListener);
        window.removeEventListener("message", windowListenerHandler);
    });
}

let lastRefresh = 0;
export function getVideo(): HTMLVideoElement | null {
    setupVideoMutationListener();

    if (!isVisible(video) && Date.now() - lastRefresh > 500) {
        lastRefresh = Date.now();
        void refreshVideoAttachments();
    }

    return video;
}

export function getVideoID(): VideoID | null {
    return videoID;
}

export function getWaitingForChannelID(): boolean {
    return waitingForChannelID;
}

export function getChannelIDInfo(): ChannelIDInfo {
    return channelIDInfo;
}

export function getIsLivePremiere(): boolean {
    return isLivePremiere;
}