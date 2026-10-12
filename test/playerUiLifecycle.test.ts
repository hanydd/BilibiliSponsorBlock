/** @jest-environment jsdom */
import { PlayerUiLifecycle } from "../src/content/playerUiLifecycle";
import type { PlayerUIReadySnapshot } from "../src/content/playerUi";

const host = (): PlayerUIReadySnapshot => ({
    hidden: false, pageLoaded: true, video: document.createElement("video"),
    leftControls: document.createElement("div"), rightControls: document.createElement("div"),
    progressBar: document.createElement("div"),
});
let state: PlayerUIReadySnapshot;
let duration: number;
let lifecycle: PlayerUiLifecycle;
const ready = jest.fn(), invalidated = jest.fn(), timelineChanged = jest.fn();
beforeEach(() => {
    jest.useFakeTimers();
    state = host(); duration = 1227;
    jest.clearAllMocks();
    lifecycle = new PlayerUiLifecycle({ capture: () => state, isReady: (s) => s.pageLoaded && !s.hidden,
        duration: () => duration, ready, invalidated, timelineChanged });
});
afterEach(() => { lifecycle.dispose(); jest.useRealTimers(); });
const settle = () => jest.advanceTimersByTimeAsync(250);

test("waits for hydration and restarts stabilization when SSR hosts are replaced", async () => {
    state.pageLoaded = false;
    const resolved = jest.fn();
    const waiting = lifecycle.wait(2000).then(resolved);
    await settle(); expect(resolved).not.toHaveBeenCalled();
    state.pageLoaded = true; lifecycle.requestCheck();
    await jest.advanceTimersByTimeAsync(100);
    state = host(); lifecycle.requestCheck();
    await jest.advanceTimersByTimeAsync(100);
    expect(ready).not.toHaveBeenCalled();
    await settle(); await waiting;
    expect(resolved).toHaveBeenCalledWith(state);
    expect(ready).toHaveBeenCalledTimes(1);
});

test("short waiter deadlines do not cancel other consumers or lose late subscribers", async () => {
    state.pageLoaded = false;
    const short = lifecycle.wait(100).catch((error: Error) => error.message);
    const long = lifecycle.wait(2000);
    await settle(); expect(await short).toContain("TIMEOUT");
    state.pageLoaded = true; lifecycle.requestCheck(); await settle();
    expect(await long).toBe(state);
    expect(await lifecycle.wait(10)).toBe(state);
    expect(ready).toHaveBeenCalledTimes(1);
});

test("publishes timeline changes without remounting controls or reacting to its own DOM updates", async () => {
    lifecycle.requestCheck(); await settle();
    for (let i = 0; i < 5; i++) { lifecycle.requestCheck(); await settle(); }
    expect(ready).toHaveBeenCalledTimes(1); expect(timelineChanged).toHaveBeenCalledTimes(1);
    duration = 2367; lifecycle.requestCheck(); await settle();
    expect(timelineChanged).toHaveBeenLastCalledWith(state.video, 2367);
    expect(ready).toHaveBeenCalledTimes(1);
    duration = 743; lifecycle.requestCheck(); await settle();
    expect(timelineChanged).toHaveBeenLastCalledWith(state.video, 743);
    expect(ready).toHaveBeenCalledTimes(1);
});

test("replaces hosts, restores retained hosts after route reset, and handles visibility", async () => {
    lifecycle.requestCheck(); await settle();
    state = host(); lifecycle.requestCheck(); await settle();
    expect(invalidated).toHaveBeenCalledTimes(1); expect(ready).toHaveBeenCalledTimes(2);
    lifecycle.refresh(); await settle(); expect(ready).toHaveBeenCalledTimes(3);
    state.hidden = true; lifecycle.requestCheck(); await settle(); expect(invalidated).toHaveBeenCalledTimes(2);
    state.hidden = false; lifecycle.requestCheck(); await settle(); expect(ready).toHaveBeenCalledTimes(4);
});

test("cleanup rejects pending waits and stops all future emissions", async () => {
    state.pageLoaded = false;
    const waiting = lifecycle.wait(1000).catch((error: Error) => error.message);
    lifecycle.dispose(); expect(await waiting).toContain("disposed");
    state.pageLoaded = true; lifecycle.requestCheck(); await settle(); expect(ready).not.toHaveBeenCalled();
});
