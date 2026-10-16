import { addCleanupListener } from "../utils/cleanup";
import { sourceId } from "../utils/injectedScriptMessageUtils";
import { logUiLifecycle } from "../utils/logger";
import { getContentApp } from "./app";
import { CONTENT_EVENTS } from "./app/events";
import { contentState, getPageLoaded } from "./state";

let listening = false;
const pending = new Set<() => void>();

/** One hydration gate for all DOM consumers, including subscribers arriving after the signal. */
export function waitForPageReady(timeout?: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new Error("Page readiness wait cancelled"));
    if (getPageLoaded()) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const finish = (error?: Error) => {
            clearTimeout(timer);
            off();
            signal?.removeEventListener("abort", cancel);
            pending.delete(cancel);
            if (error) reject(error); else resolve();
        };
        const cancel = () => finish(new Error("Page readiness wait cancelled"));
        const off = getContentApp().bus.on(CONTENT_EVENTS.APP_PAGE_READY, () => finish());
        const timer = timeout === undefined ? undefined : setTimeout(() => finish(new Error("TIMEOUT waiting for page hydration")), timeout);
        pending.add(cancel);
        signal?.addEventListener("abort", cancel, { once: true });
    });
}

export function setupPageLoadingListener(): void {
    if (listening) return;
    listening = true;
    const started = performance.now();
    const markReady = (reason: string) => {
        if (getPageLoaded()) return;
        contentState.pageLoaded = true;
        logUiLifecycle("pageReady", "ready", {
            action: "resolved", reason, elapsed: Math.round(performance.now() - started),
        });
        getContentApp().bus.emit(CONTENT_EVENTS.APP_PAGE_READY, { pageLoaded: true }, { source: "pageReadiness" });
    };
    const onMessage = (event: MessageEvent) => {
        if (event.source !== window || event.data?.source !== sourceId || event.data?.type !== "pageReady") return;
        const details = event.data.details ?? {};
        logUiLifecycle("pageReady", "state", { action: "mainWorldSignal", ...details });
        markReady(details.framework === "next" ? "Next.js hydration signal from MAIN world" : "vue-mount signal from MAIN world");
    };
    window.addEventListener("message", onMessage);
    // MAIN may have mounted before this content script was injected/reloaded.
    window.postMessage({ source: sourceId, type: "requestPageReady" }, "/");

    const fallback = () => {
        // A timeout is not evidence that a known SSR root has hydrated. Only
        // pages without a supported framework root use the document fallback.
        if (performance.now() - started >= 30000 && !document.querySelector("#app, #__next, #__NEXT_DATA__") && document.readyState === "complete") {
            markReady("document fallback: no supported framework root");
        }
    };
    const timer = setTimeout(fallback, 30000);
    window.addEventListener("load", fallback);
    addCleanupListener(() => {
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        window.removeEventListener("load", fallback);
        listening = false;
        for (const cancel of pending) cancel();
    });
}
