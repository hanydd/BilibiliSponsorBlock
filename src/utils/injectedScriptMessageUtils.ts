import { BVID, CID } from "../types";

export const sourceId = "biliSponsorBlock";

interface InjectedScriptMessageBase {
    source: string;
    id: string;
    type: string;
}

export interface InjectedScriptMessageSend extends InjectedScriptMessageBase {
    responseType: string;
    payload?: unknown;
}

export interface InjectedScriptMessageRecieve extends InjectedScriptMessageBase {
    data: unknown;
}

interface InjectedScriptMessageType {
    sendType: string;
    responseType: string;
}

export async function getPropertyFromWindow<T>(
    messageType: InjectedScriptMessageType,
    payload?: unknown,
    timeout = 200
): Promise<T | null> {
    return new Promise((resolve) => {
        const id = `message_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const messageListener = (message: MessageEvent) => {
            if (message.data?.source !== sourceId) {
                return;
            }
            const data = message.data as InjectedScriptMessageRecieve;
            if (data?.type === messageType.responseType && data?.id === id) {
                clearTimeout(messageTimeout);
                window.removeEventListener("message", messageListener);
                resolve(data.data as T);
            }
        };
        window.addEventListener("message", messageListener);
        window.postMessage(
            {
                source: sourceId,
                type: messageType.sendType,
                responseType: messageType.responseType,
                payload: payload,
                id: id,
            } as InjectedScriptMessageSend,
            "/"
        );

        // count as failed if no response after certain time
        const messageTimeout = setTimeout(() => {
            window.removeEventListener("message", messageListener);
            resolve(null);
        }, timeout);
    });
}

export async function getVideoDescriptionFromWindow(): Promise<string | null> {
    return getPropertyFromWindow<string>({
        sendType: "getDescription",
        responseType: "returnDescription",
    });
}

export async function getBvidFromAidFromWindow(aid: string): Promise<BVID | null> {
    return getPropertyFromWindow<BVID>(
        {
            sendType: "convertAidToBvid",
            responseType: "returnAidToBvid",
        },
        aid
    );
}

export async function getCidFromBvidAndPageFromWindow(bvid: BVID, page?: number): Promise<CID | null> {
    return getPropertyFromWindow<CID>(
        {
            sendType: "getCidFromBvid",
            responseType: "returnCidFromBvid",
        },
        { bvid, page },
    );
}
