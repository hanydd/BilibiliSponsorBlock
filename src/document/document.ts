import { BilibiliResponse, BiliPlayInfo, BiliVideoDetail } from "../requests/type/BilibiliRequestType";
import { BVID } from "../types";
import { waitFor } from "../utils/";
import { InjectedScriptMessageSend, sourceId } from "../utils/injectedScriptMessageUtils";
import { getBvid, saveAidFromDetail } from "./aidMap";
import { getCidFromBvIdPage, getCidMap } from "./cidListMap";
import { getFrameRate, playUrlResponseToPlayInfo, savePlayInfo } from "./frameRateUtils";

const sendMessageToContent = (messageData: InjectedScriptMessageSend, payload): void => {
    window.postMessage(
        {
            source: sourceId,
            type: messageData.responseType,
            id: messageData.id,
            data: payload,
        },
        "/"
    );
};

function overwriteFetch() {
    const originalFetch = window.fetch;

    window.fetch = async function (input, init) {
        const urlStr = typeof input === "string" ? input : (input as Request).url;
        const response = await originalFetch(input, init);
        response
            .clone()
            .text()
            .then((res) => processURLRequest(new URL(urlStr, window.location.href), res))
            .catch((e) => {
                console.error("[BSB] Error processing URL Request: ", e);
            });
        return response;
    };
}

function overwriteXHR() {
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | BodyInit | null) {
        this.addEventListener("loadend", function () {
            if (this.readyState === this.DONE && this.status >= 200 && this.status < 300) {
                try {
                    if (this.responseType === "" || this.responseType === "text") {
                        const url = new URL(this.responseURL);
                        processURLRequest(url, this.responseText);
                    }
                } catch (e) {
                    console.error("[BSB] Error processing URL Request: ", e);
                }
            }
        });
        originalSend.call(this, body);
    };
}

function processURLRequest(url: URL, responseText: string): void {
    if (url.pathname.startsWith("/player/wbi/playurl")) {
        const response = JSON.parse(responseText) as BilibiliResponse<BiliPlayInfo>;
        const cid = url.searchParams.get("cid");
        if (cid && response?.data?.dash?.video) {
            savePlayInfo(cid, playUrlResponseToPlayInfo(response.data));
        }
    } else if (url.pathname.startsWith("/x/player/wbi/v2")) {
        const response = JSON.parse(responseText) as BilibiliResponse<BiliVideoDetail>;
        saveAidFromDetail(response.data);
    }
}

async function windowMessageListener(message: MessageEvent) {
    const data: InjectedScriptMessageSend = message.data;
    if (!data || !data?.source) {
        return;
    }
    if (data?.source === sourceId && data?.responseType) {
        if (data.type === "getBvID") {
            if (window?.__INITIAL_STATE__?.bvid && window?.__INITIAL_STATE__?.cid) {
                sendMessageToContent(data, `${window?.__INITIAL_STATE__?.bvid}+${window?.__INITIAL_STATE__?.cid}`);
            } else {
                sendMessageToContent(data, null);
            }
        } else if (data.type === "getFrameRate") {
            sendMessageToContent(data, getFrameRate());
        } else if (data.type === "getChannelID") {
            sendMessageToContent(data, window?.__INITIAL_STATE__?.upData?.mid);
        } else if (data.type === "getDescription") {
            sendMessageToContent(data, window?.__INITIAL_STATE__?.videoData?.desc);
        } else if (data.type === "convertAidToBvid") {
            sendMessageToContent(data, await getBvid(data.payload as string));
        } else if (data.type === "getCidFromBvid") {
            const payload = data.payload as { bvid: BVID; page: number };
            sendMessageToContent(data, await getCidFromBvIdPage(payload.bvid, payload.page));
        } else if (data.type === "getCidMap") {
            sendMessageToContent(data, await getCidMap(data.payload as BVID));
        }
    }
}

async function addMid() {
    const pageObserver = new MutationObserver((mutationList) => {
        for (const mutation of mutationList) {
            const el = (mutation.addedNodes[0] as HTMLElement).querySelector(".bili-dyn-item");
            const vueInstance = (el as unknown as { __vue__?: { author?: { mid: number; type: string } } }).__vue__;
            if (vueInstance?.author?.mid && vueInstance.author.type === "AUTHOR_TYPE_NORMAL") {
                const mid = vueInstance.author.mid;
                el.querySelector(".bili-dyn-item__avatar")?.setAttribute("bilisponsor-userid", mid.toString());
            }
        }
    });

    pageObserver.observe(await getElementWaitFor(".bili-dyn-list__items"), {
        attributeFilter: ["class"],
        childList: true,
    });

    (await getElementWaitFor(".bili-dyn-up-list__content, .nav-bar__main-left")).addEventListener("click", async () => {
        pageObserver.disconnect();

        pageObserver.observe(await getElementWaitFor(".bili-dyn-list__items"), {
            attributeFilter: ["class"],
            childList: true,
        });
    });

    async function getElementWaitFor(element: string) {
        return await waitFor(() => document.querySelector(element) as HTMLElement, 5000, 50);
    }
}

function init(): void {
    window.addEventListener("message", windowMessageListener);
    overwriteFetch();
    overwriteXHR();
    if (window.location.href.includes("t.bilibili.com") || window.location.href.includes("space.bilibili.com")) {
        addMid();
    }
}

init();
