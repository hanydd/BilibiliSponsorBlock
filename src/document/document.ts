import { BilibiliResponse, BiliPlayInfo } from "../requests/type/BilibiliRequestType";
import { InjectedScriptMessageSend, sourceId } from "../utils/injectedScriptMessageUtils";
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
            .catch(() => {});
        return response;
    };
}

function overwriteXHR() {
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.send = function (body?: Document | BodyInit | null) {
        this.addEventListener("loadend", function () {
            if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
                try {
                    const url = new URL(this.responseURL);
                    processURLRequest(url, this.responseText);
                } catch (e) {
                    console.debug("Failed to process request");
                }
            }
        });
        originalSend.call(this, body);
    };
}

function processURLRequest(url: URL, responseText: string): void {
    if (url.pathname.includes("/player/wbi/playurl")) {
        const response = JSON.parse(responseText) as BilibiliResponse<BiliPlayInfo>;
        const cid = url.searchParams.get("cid");
        if (cid && response?.data?.dash?.video) {
            savePlayInfo(cid, playUrlResponseToPlayInfo(response.data));
        }
    }
}

function windowMessageListener(message: MessageEvent) {
    const data: InjectedScriptMessageSend = message.data;
    if (!data || !data?.source) {
        return;
    }
    if (data?.source === sourceId && data?.responseType) {
        if (data.type === "getBvID") {
            sendMessageToContent(data, window?.__INITIAL_STATE__?.bvid);
        } else if (data.type === "getFrameRate") {
            sendMessageToContent(data, getFrameRate());
        } else if (data.type === "getChannelID") {
            sendMessageToContent(data, window?.__INITIAL_STATE__?.upData?.mid);
        } else if (data.type === "getDescription") {
            sendMessageToContent(data, window?.__INITIAL_STATE__?.videoData?.desc);
        }
    }
}

function init(): void {
    window.addEventListener("message", windowMessageListener);
    overwriteFetch();
    overwriteXHR();
}

init();
