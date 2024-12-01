import { InjectedScriptMessageSend, sourceId } from "./utils/injectedScriptMessageUtils";

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
let frameRate: number = 30;

(function () {
    const originalFetch = window.fetch;

    window.fetch = async function (input, init) {
        const url = typeof input === 'string' ? input : (input as Request).url;

        const response = await originalFetch(input, init);
        if (url.includes('/player/wbi/playurl') && url.includes(window.__INITIAL_STATE__.cid.toString())) {
            response.clone().json().then(data => {
                frameRate = data.data.dash.video
                    .filter((v) => v.id === data.data.quality && v.codecid === data.data.video_codecid)[0]?.frameRate;
            }).catch(() => {
                frameRate = 30;
            });
        }
        return response;
    };
})

function windowMessageListener(message: MessageEvent) {
    const data: InjectedScriptMessageSend = message.data;
    if (!data || !data?.source) {
        return;
    }
    if (data?.source === sourceId && data?.responseType) {
        if (data.type === "getBvID") {
            sendMessageToContent(data, window?.__INITIAL_STATE__?.bvid);
        } else if (data.type === "getFrameRate") {
            sendMessageToContent(data, frameRate);
        } else if (data.type === "getChannelID") {
            sendMessageToContent(data, window?.__INITIAL_STATE__?.upData?.mid);
        } else if (data.type === "getDescription") {
            sendMessageToContent(data, window?.__INITIAL_STATE__?.videoData?.desc);
        }
    }
}

function init(): void {
    window.addEventListener("message", windowMessageListener);
}

init();
