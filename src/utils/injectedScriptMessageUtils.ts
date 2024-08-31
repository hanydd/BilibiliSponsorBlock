export const sourceId = "biliSponsorBlock";

export interface InjectedScriptMessageBase {
    source: string;
    id: string;
    type: string;
}

export interface InjectedScriptMessageSend extends InjectedScriptMessageBase {
    responseType: string;
}

export interface InjectedScriptMessageRecieve extends InjectedScriptMessageBase {
    data: unknown;
}

export interface InjectedScriptMessageType {
    sendType: string;
    responseType: string;
}

export async function getPropertyFromWindow<T>(
    messageType: InjectedScriptMessageType,
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
