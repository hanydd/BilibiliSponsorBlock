/** @jest-environment jsdom */
import { PlayerUiLifecycle } from "../src/content/playerUiLifecycle";
import type { PlayerUIReadySnapshot } from "../src/content/playerUi";

const host = (): PlayerUIReadySnapshot => {
    const video = document.createElement("video");
    Object.defineProperties(video, { readyState: { configurable: true, value: 1 } });
    document.body.append(video);
    return { hidden: false, pageLoaded: true, video,
        leftControls: document.createElement("div"), rightControls: document.createElement("div"),
        timeControl: null, progressBar: document.createElement("div") };
};
let state: PlayerUIReadySnapshot;
let duration: number;
let lifecycle: PlayerUiLifecycle;
const ready = jest.fn(), invalidated = jest.fn(), timelineChanged = jest.fn();
beforeEach(() => {
    jest.useFakeTimers();
    state = host(); duration = 1227;
    jest.clearAllMocks();
    lifecycle = new PlayerUiLifecycle({ capture: () => state, isReady: (s) => s.pageLoaded && !s.hidden && !!s.leftControls && !!s.rightControls && !!s.progressBar,
        duration: () => duration, ready, invalidated, timelineChanged });
});
afterEach(() => { lifecycle.dispose(); document.body.replaceChildren(); jest.useRealTimers(); });
const settle = () => jest.advanceTimersByTimeAsync(250);

test("waits for hydration and restarts stabilization when SSR hosts are replaced", async () => {
    state.pageLoaded = false;
    const resolved = jest.fn();
    const waiting = lifecycle.wait(2000).then(resolved);
    await settle(); expect(resolved).not.toHaveBeenCalled();
    expect(timelineChanged).not.toHaveBeenCalled();
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


test("keeps timeline facts current with collapsed controls without remounting", async () => {
    lifecycle.requestCheck(); await settle();
    state.rightControls = null;
    duration = 240; lifecycle.requestCheck(); await settle();
    expect(timelineChanged).toHaveBeenLastCalledWith(state.video, 240);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(invalidated).toHaveBeenCalledTimes(1);
    duration = 60; lifecycle.requestCheck(); await settle();
    expect(timelineChanged).toHaveBeenLastCalledWith(state.video, 60);
    expect(timelineChanged).toHaveBeenCalledTimes(3);
});

test("does not publish a stale timeline for unloaded or disconnected media", async () => {
    state.rightControls = null;
    Object.defineProperty(state.video, "readyState", { configurable: true, value: 0 });
    lifecycle.requestCheck(); await settle();
    expect(timelineChanged).not.toHaveBeenCalled();
    Object.defineProperty(state.video, "readyState", { configurable: true, value: 1 });
    lifecycle.requestCheck(); await settle();
    expect(timelineChanged).toHaveBeenCalledTimes(1);
    state.video.remove(); duration = 60;
    lifecycle.requestCheck(); await settle();
    expect(timelineChanged).toHaveBeenCalledTimes(1);
    document.body.append(state.video);
    lifecycle.requestCheck(); await settle();
    expect(timelineChanged).toHaveBeenLastCalledWith(state.video, 60);
});

test("retries late or replaced time anchors without delaying other controls", async () => {
    lifecycle.requestCheck(); await settle();
    expect(ready).toHaveBeenCalledTimes(1);
    state = { ...state, timeControl: document.createElement("span") };
    lifecycle.requestCheck(); await settle();
    expect(ready).toHaveBeenLastCalledWith(state);
    expect(ready).toHaveBeenCalledTimes(2);
    state = { ...state, timeControl: document.createElement("span") };
    lifecycle.requestCheck(); await settle();
    expect(ready).toHaveBeenCalledTimes(3);
    expect(timelineChanged).toHaveBeenCalledTimes(1);
});
