import { getFrameRate, PlayInfo } from "./document/frameRateUtils";
import { DataCache } from "./utils/cache";
import { InjectedScriptMessageSend, sourceId } from "./utils/injectedScriptMessageUtils";

const playInfoCache = new DataCache<string, PlayInfo[]>(() => []);

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
            .json()
            .then((res) => {
                const url = new URL(urlStr, window.location.href);
                if (url.pathname.includes("/player/wbi/playurl")) {
                    const cid = url.searchParams.get("cid");
                    if (!playInfoCache.getFromCache(cid) && res?.data?.dash?.video) {
                        playInfoCache.set(
                            cid,
                            res.data.dash.video.map((v) => ({ id: v.id, frameRate: parseFloat(v.frameRate) }))
                        );
                    }
                }
            })
            .catch(() => {});
        return response;
    };
}

function overwriteXHR() {
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.send = function (body?: Document | BodyInit | null) {
        this.addEventListener("loadend", function () {
            if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
                const url = new URL(this.responseURL);

                if (url.pathname.includes("/player/wbi/playurl")) {
                    const cid = url.searchParams.get("cid");
                    const res = JSON.parse(this.responseText);
                    if (!playInfoCache.getFromCache(cid) && res?.data?.dash?.video) {
                        playInfoCache.set(
                            cid,
                            res.data.dash.video.map((v) => ({ id: v.id, frameRate: parseFloat(v.frameRate) }))
                        );
                    }
                }
            }
        });
        originalSend.call(this, body);
    };
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
            sendMessageToContent(data, getFrameRate(playInfoCache));
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
