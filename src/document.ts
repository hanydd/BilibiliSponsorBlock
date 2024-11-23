import { AID, BvID, CID, VideoID } from "./types";
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

function windowMessageListener(message: MessageEvent) {
    const data: InjectedScriptMessageSend = message.data;
    if (!data || !data?.source) {
        return;
    }
    if (data?.source === sourceId && data?.responseType) {
        if (data.type === "getVideoID") {
            const videoID = {
                bvid: window?.__INITIAL_STATE__?.bvid,
                aid: window?.__INITIAL_STATE__?.aid,
                p: window?.__INITIAL_STATE__?.p,
                cid: window?.__INITIAL_STATE__?.videoData?.cid,
            } as VideoID;
            sendMessageToContent(data, videoID);
        } else if (data.type === "getFrameRate") {
            const currentQuality = window?.__playinfo__?.data?.quality;
            const frameRate = window?.__playinfo__?.data?.dash?.video.filter((v) => v.id === currentQuality)[0]
                ?.frameRate;
            sendMessageToContent(data, frameRate);
        } else if (data.type === "getChannelID") {
            sendMessageToContent(data, window?.__INITIAL_STATE__?.upInfo?.mid);
        } else if (data.type === "getDescription") {
            sendMessageToContent(data, window?.__INITIAL_STATE__?.videoData?.desc);
        }
    }
}

function init(): void {
    window.addEventListener("message", windowMessageListener);
}

init();
