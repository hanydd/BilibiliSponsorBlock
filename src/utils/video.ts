import { waitFor } from "./";
import { newThumbnails } from "../thumbnail-utils/thumbnailManagement";
import { addCleanupListener, setupCleanupListener } from "./cleanup";
import { getElement, isVisible, waitForElement } from "./dom";
import { injectScript } from "./scriptInjector";
import { LocalStorage, ProtoConfig, SyncStorage, isSafari } from "../config/config";
import { getBilibiliVideoID } from "./parseVideoID";

export enum PageType {
    Unknown = "unknown",
    Main = "main",
    Video = "video",
    Search = "search",
    Dynamic = "dynamic",
    Channel = "channel",
    Message = "message",
    Embed = "embed",
}
export type VideoID = string & { __videoID: never };
export type ChannelID = string & { __channelID: never };
export enum ChannelIDStatus {
    Fetching,
    Found,
    Failed,
}
export interface ChannelIDInfo {
    id: ChannelID | null;
    status: ChannelIDStatus;
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
let isLivePremiere: boolean;

let videoID: VideoID | null = null;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    allowClipPage: false,
};
let getConfig: () => ProtoConfig<SyncStorage, LocalStorage>;
export function setupVideoModule(
    moduleParams: VideoModuleParams,
    config: () => ProtoConfig<SyncStorage, LocalStorage>
) {
    params = moduleParams;
    getConfig = config;

    setupCleanupListener();

    // Direct Links after the config is loaded
    void waitFor(() => getConfig().isReady(), 1000, 1).then(async () => videoIDChange(await getBilibiliVideoID()));

    // TODO: Add support for embed iframe videos
    // Can't use onInvidious at this point, the configuration might not be ready.
    // if (BILI_DOMAINS.includes(location.host)) {
    //     waitForElement(embedTitleSelector)
    //         .then((e) => waitFor(() => e.getAttribute("href")))
    //         .then(async () => videoIDChange(await getBilibiliVideoID()))
    //         // Ignore if not an embed
    //         .catch(() => {}); // eslint-disable-line @typescript-eslint/no-empty-function
    // }

    addPageListeners();

    // Register listener for URL change via Navigation API
    const navigationApiAvailable = "navigation" in window;
    if (navigationApiAvailable) {
        // TODO: Remove type cast once type declarations are updated
        const navigationListener = async (e) =>
            void videoIDChange(
                await getBilibiliVideoID((e as unknown as Record<string, Record<string, string>>).destination.url)
            );
        (window as unknown as { navigation: EventTarget }).navigation.addEventListener("navigate", navigationListener);

        addCleanupListener(() => {
            (window as unknown as { navigation: EventTarget }).navigation.removeEventListener(
                "navigate",
                navigationListener
            );
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
    const id = await getBilibiliVideoID();

    if (id === videoID) return false;
    return await videoIDChange(id);
}

export async function checkVideoIDChange(): Promise<boolean> {
    const id = await getBilibiliVideoID();

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
        id: null,
    };
    isLivePremiere = false;

    // Reset the last media session link
    window.postMessage(
        {
            type: "sb-reset-media-session-link",
            videoID: null,
        },
        "/"
    );
}

//checks if this channel is whitelisted, should be done only after the channelID has been loaded
export async function whitelistCheck() {
    // TODO: find a route event in Bilibli

    // Try fallback
    // Bilibili watch page
    const channelNameCard = await Promise.race([
        waitForElement("div.membersinfo-upcard > a.avatar"), // collab video with multiple up
        waitForElement("a.up-name"),
    ]);
    const channelIDFallback = channelNameCard
        // TODO: more types of pages?
        // ?? document.querySelector("a.ytp-title-channel-logo") // YouTube Embed
        ?.getAttribute("href")
        ?.match(/(?:space\.bilibili\.com\/)([1-9][0-9]{0,11})/)?.[1];

    if (channelIDFallback) {
        channelIDInfo = {
            status: ChannelIDStatus.Found,
            // id: (pageMangerChannelID ?? channelIDFallback) as ChannelID
            id: channelIDFallback as ChannelID,
        };
    } else {
        channelIDInfo = {
            status: ChannelIDStatus.Failed,
            id: null,
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
            checkTimeout = setTimeout(
                setupVideoMutationListener,
                Math.max(1000, Date.now() - lastMutationListenerCheck)
            );
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
            subtree: true,
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
    const newVideo =
        (isSafari() && (document.querySelector('video[vinegared="true"]') as HTMLVideoElement)) ||
        ((await waitForElement("#bilibili-player video", false)) as HTMLVideoElement);
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

        const waiting = waitForElement(embedTitleSelector).then((e) =>
            waitFor(
                () => e,
                undefined,
                undefined,
                (e) => e.getAttribute("href") !== embedLastUrl && !!e.getAttribute("href") && !!e.textContent
            )
        );

        void waiting.catch(() => (waitingForEmbed = false));
        void waiting
            .then((e) => (embedLastUrl = e.getAttribute("href")!))
            .then(() => (waitingForEmbed = false))
            .then(async () => videoIDChange(await getBilibiliVideoID()));
    } else {
        void videoIDChange(await getBilibiliVideoID());
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
                status: ChannelIDStatus.Found,
            };

            if (!waitingForChannelID) {
                void whitelistCheck();
            }
        }

        void videoIDChange(data.videoID);
    } else if (dataType === "data" && data.videoID) {
        void videoIDChange(data.videoID);

        isLivePremiere = data.isLive || data.isPremiere;
    } else if (dataType === "newElement") {
        newThumbnails();
    } else if (dataType === "videoIDsLoaded") {
        params.newVideosLoaded?.(data.videoIDs);
    }

    params.windowListenerHandler?.(event);
}

function addPageListeners(): void {
    if (params.documentScript) {
        injectScript(params.documentScript);
    }

    // piped player init
    const playerInitListener = () => {
        if (!document.querySelector('meta[property="og:title"][content="Piped"]')) return;
        params.playerInit?.();
    };
    window.addEventListener("playerInit", playerInitListener);
    window.addEventListener("message", windowListenerHandler);

    addCleanupListener(() => {
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
