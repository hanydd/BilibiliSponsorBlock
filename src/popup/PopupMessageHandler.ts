import { Message, MessageResponse } from "../messageTypes";

export interface MessageListener {
    (request: Message, sender: unknown, sendResponse: (response: MessageResponse) => void): void;
}

export class MessageHandler {
    messageListener: MessageListener;

    constructor(messageListener?: MessageListener) {
        this.messageListener = messageListener;
    }

    sendMessage(id: number, request: Message, callback?) {
        if (this.messageListener) {
            this.messageListener(request, null, callback);
        } else if (chrome.tabs) {
            chrome.tabs.sendMessage(id, request, callback);
        } else {
            chrome.runtime.sendMessage({ message: "tabs", data: request }, callback);
        }
    }

    query(config, callback) {
        if (this.messageListener || !chrome.tabs) {
            // Send back dummy info
            callback([
                {
                    url: document.URL,
                    id: -1,
                },
            ]);
        } else {
            chrome.tabs.query(config, callback);
        }
    }
}
