import { getFrameRate, PlayInfo } from "./document/frameRateUtils";
import { DataCache } from "./utils/cache";
import { InjectedScriptMessageSend, sourceId } from "./utils/injectedScriptMessageUtils";

const cache = new DataCache<string, PlayInfo[]>(() => []);

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
                const url = new URL(urlStr);
                if (url.pathname.includes("/player/wbi/playurl")) {
                    const cid = url.searchParams.get("cid");
                    if (!cache.getFromCache(cid) && res?.data?.dash?.video) {
                        cache.setupCache(cid).push(...res.data.dash.video);
                    }
                }
            })
            .catch(() => {});
        return response;
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
            console.log("Frame rate", getFrameRate());
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
}

init();
