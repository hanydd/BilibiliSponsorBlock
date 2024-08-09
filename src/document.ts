import { sourceId } from "./utils/parseVideoID";

const sendMessage = (message): void => {
    window.postMessage({ source: sourceId, ...message }, "/");
};

function windowMessageListener(message: MessageEvent) {
    if (!message.data?.source) {
        return;
    }
    if (message.data?.source === sourceId) {
        if (message.data?.type === "getBvID") {
            sendMessage({ type: "returnBvID", id: message.data.id, bvID: window?.__INITIAL_STATE__?.bvid });
        }
    }
}

function init(): void {
    console.log("setup document listeners");
    window.addEventListener("message", windowMessageListener);
}

init();
