import { readCidReplacementPage } from "./cidReplacementPage";
import { AID, BVID, CID } from "../types";
import { waitFor } from "../utils/";
import { InjectedScriptMessageSend, sourceId } from "../utils/injectedScriptMessageUtils";
import { getBvid } from "./aidMap";
import { getCidFromBvIdPage, getCidMap } from "./cidListMap";
import { getFrameRate } from "./frameRateUtils";
import { isPageMountReady, readPageMountState } from "./pageMount";
import { observeDynamicAuthors } from "./dynamicAuthors";

type PlayerManifest = { aid: AID | null; cid: CID | null; bvid: BVID | null; p: number };

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

function readPlayerManifest(): PlayerManifest | null {
    try {
        return window?.player?.getManifest?.() ?? null;
    } catch (error) {
        return null;
    }
}

function readInitialStateVideoInfo(): PlayerManifest | null {
    const initialState = window?.__INITIAL_STATE__;
    if (!initialState?.cid || (!initialState.bvid && !initialState.aid)) {
        return null;
    }

    const page = Number(new URL(window.location.href).searchParams.get("p") ?? 1);
    return {
        aid: initialState.aid ?? null,
        cid: initialState.cid ?? null,
        bvid: initialState.bvid ?? null,
        p: Number.isFinite(page) && page > 0 ? page : 1,
    };
}

async function getPlayerManifest(timeout = 2500): Promise<PlayerManifest | null> {
    const existingManifest = readPlayerManifest();
    if (existingManifest) {
        return existingManifest;
    }

    try {
        return await waitFor(() => readPlayerManifest(), timeout, 50);
    } catch (error) {
        const initialStateVideoInfo = readInitialStateVideoInfo();
        if (initialStateVideoInfo) {
            return initialStateVideoInfo;
        }
        return null;
    }
}

let pageReadyDetails: Record<string, unknown> | null = null;

async function windowMessageListener(message: MessageEvent) {
    if (message.source === window && message.data?.source === sourceId && message.data?.type === "requestPageReady") {
        if (pageReadyDetails) window.postMessage({ source: sourceId, type: "pageReady", details: pageReadyDetails }, "/");
        return;
    }
    const data: InjectedScriptMessageSend = message.data;
    if (!data || !data?.source) {
        return;
    }
    if (data?.source === sourceId && data?.responseType) {
        if (data.type === "getBvID") {
            if (window?.__INITIAL_STATE__?.bvid && window?.__INITIAL_STATE__?.cid) {
                sendMessageToContent(data, `${window?.__INITIAL_STATE__?.bvid}+${window?.__INITIAL_STATE__?.cid}`);
            } else {
                sendMessageToContent(data, null);
            }
        } else if (data.type === "getFrameRate") {
            sendMessageToContent(data, getFrameRate());
        } else if (data.type === "getChannelID") {
            sendMessageToContent(data, window?.__INITIAL_STATE__?.upData?.mid);
        } else if (data.type === "getDescription") {
            sendMessageToContent(data, window?.__INITIAL_STATE__?.videoData?.desc);
        } else if (data.type === "convertAidToBvid") {
            sendMessageToContent(data, await getBvid(data.payload as string));
        } else if (data.type === "getCidFromBvid") {
            const payload = data.payload as { bvid: BVID; page: number };
            sendMessageToContent(data, await getCidFromBvIdPage(payload.bvid, payload.page));
        } else if (data.type === "getCidMap") {
            sendMessageToContent(data, await getCidMap(data.payload as BVID));
        } else if (data.type === "getCidReplacementPage") {
            sendMessageToContent(data, readCidReplacementPage(data.payload as string));
        } else if (data.type === "getVideoInfoOnplayer") {
            sendMessageToContent(data, await getPlayerManifest());
        }
    }
}

/**
 * Detect Vue mounting or Next.js root hydration, then notify the content script.
 */
function detectPageMountAndNotify(): void {
    const t0 = performance.now();
    let checkCount = 0;

    const notifyPageReady = (details: Record<string, unknown>) => {
        pageReadyDetails = details;
        // Populate whitelist IDs before content consumers receive pageReady.
        if (["t.bilibili.com", "space.bilibili.com"].includes(window.location.hostname)) {
            observeDynamicAuthors();
        }
        window.postMessage(
            {
                source: sourceId,
                type: "pageReady",
                details,
            },
            "/"
        );
    };

    const check = () => {
        checkCount++;
        const state = readPageMountState();

        const elapsed = Math.round(performance.now() - t0);
        if (isPageMountReady(state)) {
            notifyPageReady({
                stage: "main/pageReadyDetected",
                ...state,
                framework: state.next ? "next" : "vue",
                elapsed,
                checkCount,
                readyState: document.readyState,
            });
            return;
        }

        if (elapsed >= 30000 && !document.querySelector("#app, #__next, #__NEXT_DATA__")) return;

        // Keep waiting on known framework roots: elapsed time cannot prove hydration.
        setTimeout(check, elapsed >= 30000 ? 250 : 100);
    };

    check();
}

function init(): void {
    window.addEventListener("message", windowMessageListener);
    detectPageMountAndNotify();
}

init();
