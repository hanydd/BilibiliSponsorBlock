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
    if (!message.data?.source) {
        return;
    }
    if (message.data?.source === sourceId && message.data?.responseType) {
        const data: InjectedScriptMessageSend = message.data;
        if (data.type === "getBvID") {
            sendMessageToContent(data, window?.__INITIAL_STATE__?.bvid);
        }
    }
}

function init(): void {
    console.log("setup document listeners");
    window.addEventListener("message", windowMessageListener);
}

init();
