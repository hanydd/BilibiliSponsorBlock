import { ConfigProvider, message, theme } from "antd";
import { NoticeType as MessageNoticeType } from "antd/es/message/interface";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { waitForPageReady } from "../content/pageReadiness";

let messageText: string;
let messageType: MessageNoticeType;

export async function setMessageNotice(darkTheme: boolean = false) {
    // The same component is also used by extension options, which has no host hydration.
    if (/^https?:$/.test(window.location.protocol)) await waitForPageReady();
    if (document.getElementById("message-notice")) return;

    const container = document.createElement("div");
    container.id = "message-notice";
    container.style.display = "none";

    const root = createRoot(container);
    root.render(
        <ConfigProvider theme={{ algorithm: darkTheme ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
            <MessageApp />
        </ConfigProvider>
    );
    document.body.appendChild(container);
}

const MessageApp: React.FC = () => {
    const [messageApi, contextHolder] = message.useMessage({
        top: 74,
        getContainer: () => document.querySelector("#bilibili-player .bpx-player-container"),
    });

    function displayMessage() {
        messageApi[messageType](messageText);
    }

    return (
        <>
            {contextHolder}
            <button id="message-button" onClick={displayMessage}></button>
        </>
    );
};

export function showMessage(message: string, type: MessageNoticeType = "info") {
    const button = document.getElementById("message-button");
    if (button) {
        messageType = type;
        messageText = message;
        button.click();
    } else {
        // if the component is not mounted, setup the component first
        setMessageNotice().then(() => {
            showMessage(message);
        });
    }
}
