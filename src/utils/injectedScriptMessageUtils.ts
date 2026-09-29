import { AID, BVID, CID } from "../types";

export const sourceId = "biliSponsorBlock";

export interface VideoMatchContext {
    bvid: string;
    title: string;
    description: string;
    up_mid: string;
    up_name: string;
}

function readText(value: unknown): string {
    return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

/** Read metadata already rendered by Bilibili without introducing an API request. */
export function readPageVideoMatchContext(): VideoMatchContext {
    const initialState = readRecord(window.__INITIAL_STATE__);
    const videoData = readRecord(initialState.videoData);
    const videoInfo = readRecord(initialState.videoInfo);
    const upData = readRecord(initialState.upData);
    const owner = readRecord(videoData.owner);
    const videoDetails = readRecord(videoData.videoDetails);

    const title =
        readText(videoData.title) ||
        readText(videoInfo.title) ||
        document.querySelector("h1.video-title, h1[title]")?.textContent?.trim() ||
        document.title.trim();
    const description =
        readText(videoData.desc) ||
        readText(videoData.description) ||
        document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ||
        "";
    const upMid = readText(upData.mid) || readText(owner.mid) || readText(videoData.mid) || readText(videoData.up_mid);
    const upName =
        readText(upData.name) ||
        readText(upData.uname) ||
        readText(owner.name) ||
        readText(owner.uname) ||
        readText(videoData.up_name) ||
        readText(videoDetails.author) ||
        document.querySelector("a.up-name, .up-info .name, a[href*='space.bilibili.com']")?.textContent?.trim() ||
        "";

    return {
        bvid: readText(initialState.bvid) || readText(initialState.toBvid),
        title,
        description,
        up_mid: upMid,
        up_name: upName,
    };
}

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

export async function getVideoMatchContextFromWindow(): Promise<VideoMatchContext | null> {
    return getPropertyFromWindow<VideoMatchContext>({
        sendType: "getVideoMatchContext",
        responseType: "returnVideoMatchContext",
    }, undefined, 500);
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
        { bvid, page }
    );
}

export async function getCidMapFromWindow(bvid: BVID): Promise<Map<number, CID> | null> {
    return getPropertyFromWindow<Map<number, CID>>(
        {
            sendType: "getCidMap",
            responseType: "returnCidMap",
        },
        bvid
    );
}

export async function getVideoInfoFromWindowOnplayerManifest(): Promise<{ aid: AID | null; cid: CID | null; bvid: BVID | null; p: number } | null> {
    return getPropertyFromWindow<{ aid: AID | null; cid: CID | null; bvid: BVID | null; p: number }>(
        {
            sendType: "getVideoInfoOnplayer",
            responseType: "returnVideoInfo",
        },
        undefined,
        3200
    );
}
