import { message } from "antd";
import { NoticeType as MessageNoticeType } from "antd/es/message/interface";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { waitFor } from "../utils/";

let messageText: string;
let messageType: MessageNoticeType;

export async function setMessageNotice(checkPageLoaded: () => boolean = () => true) {
    await waitFor(() => checkPageLoaded(), 10000, 50);

    const container = document.createElement("div");
    container.id = "message-notice";
    container.style.display = "none";

    const root = createRoot(container);
    root.render(<MessageApp />);
    document.body.appendChild(container);
}

const MessageApp: React.FC = () => {
    const [messageApi, contextHolder] = message.useMessage();

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
