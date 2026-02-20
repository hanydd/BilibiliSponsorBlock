import * as documentScript from "../../dist/js/document.js";
import Config from "../config";
import { checkPageForNewThumbnails } from "../thumbnail-utils/thumbnailManagement";
import { BVID, CID, NewVideoID, PageType } from "../types";
import { waitFor } from "./";
import { addCleanupListener, setupCleanupListener } from "./cleanup";
import { getElement, isVisible, waitForElement } from "./dom";
import { getPropertyFromWindow } from "./injectedScriptMessageUtils";
import { getBilibiliVideoID } from "./parseVideoID";
import { injectScript } from "./scriptInjector";
import { parseBvidAndCidFromVideoId } from "./videoIdUtils";

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

const embedTitleSelector = "h1.video-title";

let video: HTMLVideoElement | null = null;
let videoMutationObserver: MutationObserver | null = null;
let videoMutationListenerElement: HTMLElement | null = null;
// What videos have run through setup so far
const videosSetup: HTMLVideoElement[] = [];
let waitingForNewVideo = false;

let videoID: NewVideoID | null = null;
let pageType: PageType = PageType.Unknown;
let channelIDInfo: ChannelIDInfo;
let waitingForChannelID = false;
let frameRate: number = 30;

interface contentMethodType {
    videoIDChange: () => void;
    channelIDChange: (channelIDInfo: ChannelIDInfo) => void;
    resetValues: () => void;
    videoElementChange?: (newVideo: boolean, video: HTMLVideoElement | null) => void;
}

let contentMethod: contentMethodType;

export function setupVideoModule(method: contentMethodType) {
    contentMethod = method;
    setupCleanupListener();

    // Direct Links after the config is loaded
    void waitFor(() => Config.isReady(), 1000, 1)
        .then(() => detectPageType())
        .then(() => getBilibiliVideoID())
        .then((id) => videoIDChange(id));

    // TODO: Add support for embed iframe videos

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
    void waitFor(() => Config.local !== null).then(() => {
        if (Config.local!.navigationApiAvailable !== navigationApiAvailable) {
            Config.local!.navigationApiAvailable = navigationApiAvailable;
            Config.forceLocalUpdate("navigationApiAvailable");
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

async function videoIDChange(id: NewVideoID | null): Promise<boolean> {
    detectPageType();

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
    await waitFor(() => Config.isReady(), 5000, 1);

    // Update whitelist data when the video data is loaded
    void whitelistCheck();

    contentMethod.videoIDChange();

    return true;
}

function resetValues() {
    contentMethod.resetValues();

    videoID = null;
    pageType = PageType.Unknown;
    channelIDInfo = {
        status: ChannelIDStatus.Fetching,
        id: null,
    };

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
    waitingForChannelID = true;

    const channelID = await getPropertyFromWindow<ChannelID>({
        sendType: "getChannelID",
        responseType: "returnChannelID",
    });

    if (channelID) {
        channelIDInfo = {
            id: channelID,
            status: ChannelIDStatus.Found,
        };
    } else {
        // Try fallback
        // Bilibili watch page
        const channelNameCard = await Promise.race([
            waitForElement("div.membersinfo-upcard > a.avatar"), // collab video with multiple up
            waitForElement("a.up-name"),
        ]);
        const channelIDFallback = channelNameCard
            // TODO: support more types of pages
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
    }

    waitingForChannelID = false;
    contentMethod.channelIDChange(channelIDInfo);
}

export function detectPageType(): PageType {
    pageType = PageType.Unknown;

    const urlObject = new URL(document.URL);
    if (urlObject.hostname === "www.bilibili.com") {
        if (urlObject.pathname.startsWith("/video/")) {
            pageType = PageType.Video;
        } else if (urlObject.pathname.startsWith("/list/")) {
            pageType = PageType.List;
        } else if (/BV[a-zA-Z0-9]{10}/.test(urlObject.searchParams.get("bvid"))){
            pageType = PageType.Festival;
        } else if (urlObject.pathname.startsWith("/history")) {
            pageType = PageType.History;
        } else if (urlObject.pathname.startsWith("/account/history")) {
            pageType = PageType.OldHistory;
        } else if (urlObject.pathname.startsWith("/bangumi/")) {
            pageType = PageType.Anime;
        } else if (urlObject.pathname.startsWith("/opus/")) {
            pageType = PageType.Opus;
        } else {
            pageType = PageType.Main;
        }
    } else if (urlObject.hostname === "search.bilibili.com") {
        pageType = PageType.Search;
    } else if (urlObject.hostname === "t.bilibili.com") {
        pageType = PageType.Dynamic;
    } else if (urlObject.hostname === "space.bilibili.com") {
        pageType = PageType.Channel;
    } else if (urlObject.hostname === "message.bilibili.com") {
        pageType = PageType.Message;
    } else if (urlObject.hostname === "manga.bilibili.com") {
        pageType = PageType.Manga;
    } else if (urlObject.hostname === "live.bilibili.com") {
        pageType = PageType.Live;
    }
    return pageType;
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
        videoMutationObserver = new MutationObserver(refreshVideoAttachments);
        videoMutationListenerElement = videoContainer;

        videoMutationObserver.observe(videoContainer, {
            attributes: true,
            childList: true,
            subtree: true,
        });
    }
}

const waitingForVideoListeners: Array<(video: HTMLVideoElement) => void> = [];
export function waitForVideo(): Promise<HTMLVideoElement> {
    if (video) return Promise.resolve(video);

    return new Promise((resolve) => {
        waitingForVideoListeners.push(resolve);
    });
}

// Used only for embeds to wait until the url changes
let embedLastUrl = "";
let waitingForEmbed = false;

async function refreshVideoAttachments(): Promise<void> {
    if (waitingForNewVideo) return;

    void updateFrameRate();

    waitingForNewVideo = true;
    const newVideo = (await waitForElement("#bilibili-player video", false)) as HTMLVideoElement;
    waitingForNewVideo = false;

    if (video === newVideo) return;

    video = newVideo;
    const isNewVideo = !videosSetup.includes(video);

    if (isNewVideo) {
        videosSetup.push(video);
    }

    contentMethod.videoElementChange(isNewVideo, video);
    waitingForVideoListeners.forEach((l) => l(newVideo));
    waitingForVideoListeners.length = 0;

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
            .then(() => getBilibiliVideoID())
            .then((id) => videoIDChange(id));
    } else {
        void videoIDChange(await getBilibiliVideoID());
    }
}

function windowListenerHandler(event: MessageEvent): void {
    const data = event.data;
    const dataType = data.type;

    if (data.source !== "sponsorblock") return;

    if (dataType === "navigation") {
        checkPageForNewThumbnails();
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
    } else if (dataType === "newElement") {
        checkPageForNewThumbnails();
    }
}

function addPageListeners(): void {
    if (chrome.runtime.getManifest().manifest_version === 2) {
        injectScript(documentScript);
    }

    window.addEventListener("message", windowListenerHandler);

    addCleanupListener(() => {
        window.removeEventListener("message", windowListenerHandler);
    });
}

export async function updateFrameRate(): Promise<number> {
    frameRate = await getPropertyFromWindow<number>({
        sendType: "getFrameRate",
        responseType: "returnFrameRate",
    }).catch(() => {
        // fall back to 30 fps
        return 30;
    });
    if (!frameRate || frameRate < 1) {
        frameRate = 30;
    }
    return frameRate;
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

export function getBvID(): BVID | null {
    return parseBvidAndCidFromVideoId(videoID).bvId;
}

export function getCid(): CID | null {
    return parseBvidAndCidFromVideoId(videoID).cid;
}

export function getVideoID(): NewVideoID | null {
    return videoID;
}

export function getFrameRate(): number {
    return frameRate;
}

export function getWaitingForChannelID(): boolean {
    return waitingForChannelID;
}

export function getChannelIDInfo(): ChannelIDInfo {
    return channelIDInfo;
}

export function getPageType(): PageType {
    return pageType;
}
