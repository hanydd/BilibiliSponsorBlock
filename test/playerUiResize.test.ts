/** @jest-environment jsdom */
import { EventBus } from "../src/content/app/eventBus";
import { CONTENT_EVENTS } from "../src/content/app/events";
import { ContentEventMap } from "../src/content/app/types";
import { registerPlayerUiLifecycle, waitForPlayerUiReady } from "../src/content/playerUi";

const mockApp = { bus: new EventBus<ContentEventMap>() };
const mockCleanup: Array<() => void> = [];
jest.mock("../src/content/app", () => ({ getContentApp: () => mockApp }));
jest.mock("../src/content/state", () => ({ getPageLoaded: () => true }));
jest.mock("../src/utils/video", () => ({ getVideo: () => document.querySelector("video") }));
jest.mock("../src/utils/cleanup", () => ({ addCleanupListener: (fn) => mockCleanup.push(fn) }));
jest.mock("../src/utils/logger", () => ({
    logUiLifecycle: jest.fn(), describeElement: jest.fn(), describeVideo: jest.fn(),
}));

const instances: MockResizeObserver[] = [];
class MockResizeObserver {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
    constructor(private callback: ResizeObserverCallback) { instances.push(this); }
    notify() { this.callback([], this as unknown as ResizeObserver); }
}

const originalResizeObserver = globalThis.ResizeObserver;
let width = 0;
function rightControl(): HTMLElement {
    const element = document.createElement("div");
    element.className = "bpx-player-control-bottom-right";
    Object.defineProperties(element, { offsetWidth: { get: () => width }, offsetHeight: { value: 24 } });
    element.getBoundingClientRect = () => ({ width, height: 24 } as DOMRect);
    return element;
}

beforeEach(() => {
    jest.useFakeTimers(); width = 0; instances.length = 0;
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: MockResizeObserver });
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.body.innerHTML = '<div id="bilibili-player"><div class="bpx-player-container"><video></video>' +
        '<div class="bpx-player-control-bottom-left"></div><div class="bpx-player-progress-schedule"></div></div></div>';
    for (const element of document.querySelectorAll<HTMLElement>(".bpx-player-control-bottom-left, .bpx-player-progress-schedule")) {
        Object.defineProperties(element, { offsetWidth: { value: 100 }, offsetHeight: { value: 24 } });
        element.getBoundingClientRect = () => ({ width: 100, height: 24 } as DOMRect);
    }
    Object.defineProperties(document.querySelector("video"), { readyState: { value: 1 }, duration: { value: 120 } });
    document.querySelector(".bpx-player-container").append(rightControl());
});

afterEach(() => {
    mockCleanup.splice(0).forEach(fn => fn());
    mockApp.bus = new EventBus<ContentEventMap>();
    document.body.replaceChildren();
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: originalResizeObserver });
    jest.useRealTimers();
});

test("wakes an idle unready player on size changes, without polling or duplicate readiness", async () => {
    const ready = jest.fn(), invalidated = jest.fn();
    mockApp.bus.on(CONTENT_EVENTS.PLAYER_UI_READY, ready);
    mockApp.bus.on(CONTENT_EVENTS.PLAYER_UI_INVALIDATED, invalidated);
    const waiting = waitForPlayerUiReady();
    await jest.advanceTimersByTimeAsync(1000);
    expect(ready).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    expect(instances[0].observe).toHaveBeenCalledTimes(4);
    width = 100; instances[0].notify();
    await jest.advanceTimersByTimeAsync(1000);
    expect((await waiting).rightControls).toBe(document.querySelector(".bpx-player-control-bottom-right"));
    expect(ready).toHaveBeenCalledTimes(1);
    instances[0].notify(); await jest.advanceTimersByTimeAsync(1000);
    expect(ready).toHaveBeenCalledTimes(1);
    width = 0; instances[0].notify(); await jest.advanceTimersByTimeAsync(1000);
    expect(invalidated).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    width = 100; instances[0].notify(); await jest.advanceTimersByTimeAsync(1000);
    expect(ready).toHaveBeenCalledTimes(2);
});

test("replaces observed hosts and disconnects size monitoring on cleanup", async () => {
    width = 100; registerPlayerUiLifecycle();
    await jest.advanceTimersByTimeAsync(1000);
    const old = document.querySelector(".bpx-player-control-bottom-right");
    const replacement = rightControl(); old.replaceWith(replacement);
    await jest.advanceTimersByTimeAsync(1000);
    expect(instances[0].unobserve).toHaveBeenCalledWith(old);
    expect(instances[0].observe).toHaveBeenCalledWith(replacement, { box: "border-box" });
    mockCleanup.splice(0).forEach(fn => fn());
    expect(instances[0].disconnect).toHaveBeenCalledTimes(1);
    instances[0].notify();
    expect(jest.getTimerCount()).toBe(0);
});

test("leaves size monitoring idle on pages without a player", async () => {
    document.body.replaceChildren(); registerPlayerUiLifecycle();
    await jest.advanceTimersByTimeAsync(1000);
    expect(instances[0].observe).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
});
