import { AID, BVID, CID } from "../types";
import { waitFor } from "../utils/";
import { InjectedScriptMessageSend, sourceId } from "../utils/injectedScriptMessageUtils";
import { getBvid } from "./aidMap";
import { getCidFromBvIdPage, getCidMap } from "./cidListMap";
import { getFrameRate } from "./frameRateUtils";

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

async function windowMessageListener(message: MessageEvent) {
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
        } else if (data.type === "getVideoInfoOnplayer") {
            sendMessageToContent(data, await getPlayerManifest());
        }
    }
}

async function addMid() {
    const pageObserver = new MutationObserver((mutationList) => {
        for (const mutation of mutationList) {
            const el = (mutation.addedNodes[0] as HTMLElement).querySelector(".bili-dyn-item");
            const vueInstance = (el as unknown as { __vue__?: { author?: { mid: number; type: string } } }).__vue__;
            if (vueInstance?.author?.mid && vueInstance.author.type === "AUTHOR_TYPE_NORMAL") {
                const mid = vueInstance.author.mid;
                el.querySelector(".bili-dyn-item__avatar")?.setAttribute("bilisponsor-userid", mid.toString());
            }
        }
    });

    pageObserver.observe(await getElementWaitFor(".bili-dyn-list__items"), {
        attributeFilter: ["class"],
        childList: true,
    });

    (await getElementWaitFor(".bili-dyn-up-list__content, .nav-bar__main-left")).addEventListener("click", async () => {
        pageObserver.disconnect();

        pageObserver.observe(await getElementWaitFor(".bili-dyn-list__items"), {
            attributeFilter: ["class"],
            childList: true,
        });
    });

    async function getElementWaitFor(element: string) {
        return await waitFor(() => document.querySelector(element) as HTMLElement, 5000, 50);
    }
}

/**
 * Detect when Vue has finished mounting / hydrating the page.
 *
 * poll for the `__vue__` (Vue 2) or `__vue_app__` (Vue 3) property on
 * `#app`, then notify the ISOLATED-world content script via postMessage.
 */
function detectVueMountAndNotify(): void {
    const t0 = performance.now();
    let checkCount = 0;

    const notifyPageReady = (details: Record<string, unknown>) => {
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
        const app = document.querySelector("#app");
        const vue2 = !!(app as unknown as { __vue__?: unknown })?.__vue__;
        const vue3 = !!(app as unknown as { __vue_app__?: unknown })?.__vue_app__;

        const elapsed = Math.round(performance.now() - t0);
        if (vue2 || vue3) {
            setTimeout(() => {
                notifyPageReady({
                    stage: "main/pageReadyDetected",
                    vue2,
                    vue3,
                    elapsed,
                    checkCount,
                    readyState: document.readyState,
                });
            }, 500);
            return;
        }

        // 30 seconds timeout
        if (elapsed >= 30000) {
            notifyPageReady({
                stage: "main/pageReadyTimeout",
                vue2,
                vue3,
                elapsed,
                checkCount,
                readyState: document.readyState,
            });
            return;
        }

        setTimeout(check, 100);
    };

    check();
}

function init(): void {
    window.addEventListener("message", windowMessageListener);
    detectVueMountAndNotify();
    if (window.location.href.includes("t.bilibili.com") || window.location.href.includes("space.bilibili.com")) {
        addMid();
    }
}

init();
