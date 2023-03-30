/*
  Content script are run in an isolated DOM so it is not possible to access some key details that are sanitized when passed cross-dom
  This script is used to get the details from the page and make them available for the content script by being injected directly into the page
*/

import { PageType } from "../video";

interface StartMessage {
    type: "navigation";
    pageType: PageType;
    videoID: string | null;
}

interface FinishMessage extends StartMessage {
    channelID: string;
    channelTitle: string;
}

interface AdMessage {
    type: "ad";
    playing: boolean;
}

interface VideoData {
    type: "data";
    videoID: string;
    isLive: boolean;
    isPremiere: boolean;
}

interface ElementCreated {
    type: "newElement";
    name: string;
}

type WindowMessage = StartMessage | FinishMessage | AdMessage | VideoData | ElementCreated;

// global playerClient - too difficult to type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let playerClient: any;
let lastVideo = "";
const id = "sponsorblock";

const sendMessage = (message: WindowMessage): void => {
    window.postMessage({ source: id, ...message }, "/");
}

function setupPlayerClient(e: CustomEvent): void {
    if (playerClient) return; // early exit if already defined
    
    playerClient = e.detail;
    sendVideoData(); // send playerData after setup

    e.detail.addEventListener('onAdStart', () => sendMessage({ type: "ad", playing: true } as AdMessage));
    e.detail.addEventListener('onAdFinish', () => sendMessage({ type: "ad", playing: false } as AdMessage));
}

function navigationParser(event: CustomEvent): StartMessage | null {
    const pageType: PageType = event.detail.pageType;
    if (pageType) {
        const result: StartMessage = { type: "navigation", pageType, videoID: null };
        if (pageType === "shorts" || pageType === "watch") {
            const endpoint = event.detail.endpoint
            if (!endpoint) return null;
            
            result.videoID = (pageType === "shorts" ? endpoint.reelWatchEndpoint : endpoint.watchEndpoint).videoId;
        }

        return result;
    } else {
        return null;
    }
}

function navigationStartSend(event: CustomEvent): void {
    const message = navigationParser(event) as StartMessage;
    if (message) {
        sendMessage(message);
    }
}

function navigateFinishSend(event: CustomEvent): void {
    sendVideoData(); // arrived at new video, send video data
    const videoDetails = event.detail?.response?.playerResponse?.videoDetails;
    if (videoDetails) {
        sendMessage({ channelID: videoDetails.channelId, channelTitle: videoDetails.author, ...navigationParser(event) } as FinishMessage);
    }
}

function sendVideoData(): void {
    if (!playerClient) return;
    const videoData = playerClient.getVideoData();
    if (videoData && videoData.video_id !== lastVideo) {
        lastVideo = videoData.video_id;
        sendMessage({ type: "data", videoID: videoData.video_id, isLive: videoData.isLive, isPremiere: videoData.isPremiere } as VideoData);
    }
}

export function init(elementsToListenFor: string[] = ["ytd-thumbnail"]): void {
    document.addEventListener("yt-player-updated", setupPlayerClient);
    document.addEventListener("yt-navigate-start", navigationStartSend);
    document.addEventListener("yt-navigate-finish", navigateFinishSend);

    if (["m.youtube.com", "www.youtube.com", "www.youtube-nocookie.com", "music.youtube.com"].includes(window.location.host)) {
        // If customElement.define() is native, we will be given a class constructor and should extend it.
        // If it is not native, we will be given a function and should wrap it.
        const isDefineNative = window.customElements.define.toString().indexOf("[native code]") !== -1
        const realCustomElementDefine = window.customElements.define.bind(window.customElements);
        window.customElements.define = (name: string, constructor: CustomElementConstructor, options: ElementDefinitionOptions) => {
            let replacedConstructor: CallableFunction = constructor;
            if (elementsToListenFor.includes(name)) {
                if (isDefineNative) {
                    class WrappedThumbnail extends constructor {
                        constructor() {
                            super();
                            sendMessage({ type: "newElement", name })
                        }
                    }
                    replacedConstructor = WrappedThumbnail;
                } else {
                    // based on https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/new.target#new.target_using_reflect.construct
                    // clearly marked as bad practice, but it works lol
                    replacedConstructor = function () {
                        constructor.call(this);
                        sendMessage({ type: "newElement", name })
                    };
                    Object.setPrototypeOf(replacedConstructor.prototype, constructor.prototype);
                    Object.setPrototypeOf(replacedConstructor, constructor);
                }
            }

            realCustomElementDefine(name, replacedConstructor, options);
        }
    }
}