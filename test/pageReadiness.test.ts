/** @jest-environment jsdom */
import { EventBus } from "../src/content/app/eventBus";
import { CONTENT_EVENTS } from "../src/content/app/events";
import { ContentEventMap } from "../src/content/app/types";
import { setupPageLoadingListener, waitForPageReady } from "../src/content/pageReadiness";
import { sourceId } from "../src/utils/injectedScriptMessageUtils";

const mockApp = { bus: new EventBus<ContentEventMap>() };
const mockState = { pageLoaded: false };
const mockCleanup: Array<() => void> = [];
jest.mock("../src/content/app", () => ({ getContentApp: () => mockApp }));
jest.mock("../src/content/state", () => ({ get contentState() { return mockState; }, getPageLoaded: () => mockState.pageLoaded }));
jest.mock("../src/utils/cleanup", () => ({ addCleanupListener: (fn) => mockCleanup.push(fn) }));
jest.mock("../src/utils/logger", () => ({ logUiLifecycle: jest.fn() }));
jest.mock("../src/utils/injectedScriptMessageUtils", () => ({ sourceId: "biliSponsorBlock" }));
beforeEach(() => { jest.useFakeTimers(); mockState.pageLoaded = false; document.body.innerHTML = '<div id="__next"></div>'; });
afterEach(() => { mockCleanup.splice(0).forEach((fn) => fn()); jest.useRealTimers(); });
function signal(framework = "next") {
    window.dispatchEvent(new MessageEvent("message", { source: window, data: {
        source: sourceId, type: "pageReady", details: { stage: "main/pageReadyDetected", framework },
    } }));
}

test("shares one MAIN signal with all consumers and allows waits after readiness", async () => {
    setupPageLoadingListener(); setupPageLoadingListener();
    const emitted = jest.fn(); const off = mockApp.bus.on(CONTENT_EVENTS.APP_PAGE_READY, emitted);
    const a = waitForPageReady(), b = waitForPageReady();
    signal(); signal(); await Promise.all([a, b, waitForPageReady(1)]);
    expect(emitted).toHaveBeenCalledTimes(1); off();
});

test("a known SSR root stays gated after 30 seconds, and a timed out waiter does not consume the signal", async () => {
    setupPageLoadingListener();
    const short = waitForPageReady(100).catch((error: Error) => error.message);
    await jest.advanceTimersByTimeAsync(31000);
    expect(mockState.pageLoaded).toBe(false); expect(await short).toContain("TIMEOUT");
    const late = waitForPageReady(); signal(); await late;
});

test("waiters can cancel without affecting other consumers", async () => {
    setupPageLoadingListener();
    const controller = new AbortController();
    const cancelled = waitForPageReady(35000, controller.signal).catch((error: Error) => error.message);
    const remaining = waitForPageReady(); controller.abort();
    expect(await cancelled).toContain("cancelled"); signal(); await remaining;
});

test("plain pages use the document fallback, while cleanup removes the signal listener", async () => {
    document.body.innerHTML = "";
    Object.defineProperty(document, "readyState", { configurable: true, value: "complete" });
    setupPageLoadingListener(); await jest.advanceTimersByTimeAsync(30000);
    expect(mockState.pageLoaded).toBe(true);
    mockCleanup.splice(0).forEach((fn) => fn()); mockState.pageLoaded = false;
    signal(); expect(mockState.pageLoaded).toBe(false);
});
