import { resetLastArtworkSrc } from "./mediaSession";

export const sourceId = "biliSponsorBlock";
const sendMessage = (message): void => {
    window.postMessage({ source: sourceId, ...message }, "/");
};

function windowMessageListener(message: MessageEvent) {
    if (message.data?.source && message.data?.source === "sb-reset-media-session-link") {
        resetLastArtworkSrc();
    } else if (message.data?.source && message.data?.source === sourceId) {
        if (message.data?.type === "getBvID") {
            sendMessage({ type: "returnBvID", id: message.data.id, bvID: window?.__INITIAL_STATE__?.bvid });
        }
    }
}

export function init(): void {
    window.addEventListener("message", windowMessageListener);
}
