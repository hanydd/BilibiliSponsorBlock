/** @jest-environment jsdom */
import { checkPreviewbarState, createPreviewBar, getPreviewBar, registerPreviewBarManager, resetPreviewBarState } from "../src/content/previewBarManager";

import PreviewBar from "../src/js-components/previewBar";
import { PlayerUiLifecycle } from "../src/content/playerUiLifecycle";
import { EventBus } from "../src/content/app/eventBus";
import { CONTENT_EVENTS } from "../src/content/app/events";
import type { ContentEventMap } from "../src/content/app/types";
import { ActionType, Category, SponsorSourceType } from "../src/types";

const mockState = { previewBar: null, selectedSegment: null, lastPreviewBarUpdate: null };
let mockVideoID: string | null = "BV1test+123";
const mockApp = {
    ui: { getState: () => mockState, patchState: (patch) => Object.assign(mockState, patch) },
    commands: { execute: jest.fn(), register: jest.fn() }, bus: new EventBus<ContentEventMap>(),
};
jest.mock("../src/content/app", () => ({ getContentApp: () => mockApp }));
jest.mock("../src/content/state", () => ({ contentState: { sponsorTimes: [], sponsorTimesSubmitting: [] } }));
jest.mock("../src/config", () => ({ __esModule: true, default: { config: { barTypes: {}, showTimeWithSkips: true } } }));
jest.mock("../src/utils", () => ({ __esModule: true, default: class {
    getTimestampsDuration(ranges: number[][]) { return ranges.reduce((sum, [start, end]) => sum + end - start, 0); }
} }));
jest.mock("../src/utils/categoryUtils", () => ({ shortCategoryName: () => "Sponsor" }));
jest.mock("../src/utils/logger", () => ({ logUiLifecycle: jest.fn() }));
jest.mock("../src/utils/video", () => ({
    getVideo: () => document.querySelector("#bilibili-player video"), getVideoID: () => mockVideoID,
}));
jest.mock("../src/content/playerUi", () => ({
    isPlayerUiReady: () => true,
}));
jest.mock("../src/render/ChapterVote", () => ({ ChapterVote: class { setVisibility() {} } }));

beforeEach(() => {
    mockVideoID = "BV1test+123";
    mockApp.bus = new EventBus<ContentEventMap>();
    document.body.innerHTML = `<div class="v-recommend-inline-player"><div class="bpx-player-progress"></div></div>
        <div id="bilibili-player"><div class="bpx-player-container">
            <video></video><div class="bpx-player-video-area">
                <div class="bpx-player-progress"></div><div class="bpx-player-shadow-progress-area"></div>
            </div></div></div><div id="overlay"></div>`;
    const parent = document.querySelector("#bilibili-player .bpx-player-progress");
    Object.defineProperties(parent, { offsetWidth: { value: 800 }, offsetHeight: { value: 4 } });
    Object.defineProperty(document.querySelector("video"), "duration", { configurable: true, value: 180 });
    Object.defineProperty(document, "elementFromPoint", {
        configurable: true, value: jest.fn(() => document.querySelector("#overlay")),
    });
    Object.defineProperty(globalThis, "chrome", {
        configurable: true, value: { runtime: { sendMessage: jest.fn() } },
    });
});

afterEach(() => {
    resetPreviewBarState();
    document.body.replaceChildren();
});

test("mounts in the active player's timeline even when an overlay covers it", () => {
    createPreviewBar();
    expect(getPreviewBar()).not.toBeNull();
    expect(document.querySelector("#bilibili-player .bpx-player-progress #previewbar")).not.toBeNull();
    expect(document.querySelector(".v-recommend-inline-player #previewbar")).toBeNull();
});

test("restores the duration text after replacing a time control without redrawing marks", () => {
    const player = document.querySelector(".bpx-player-container");
    player.insertAdjacentHTML("beforeend", '<div class="bpx-player-ctrl-time"><span class="bpx-player-ctrl-time-label"></span></div>');
    createPreviewBar(); registerPreviewBarManager();
    const bar = getPreviewBar();
    bar.set([{ segment: [20, 30], actionType: ActionType.Skip, category: "sponsor" as Category,
        unsubmitted: false, showLarger: false, source: SponsorSourceType.Server }], 180);
    const draw = jest.spyOn(bar, "set");
    const old = player.querySelector(".bpx-player-ctrl-time");
    const next = old.cloneNode(true) as HTMLElement;
    old.replaceWith(next);
    mockApp.bus.emit(CONTENT_EVENTS.PLAYER_UI_READY, { snapshot: {} as never });
    expect(next.querySelector<HTMLElement>("#sponsorBlockDurationAfterSkips")?.innerText).toBe(" (2:50)");
    expect(getPreviewBar()).toBe(bar);
    expect(draw).not.toHaveBeenCalled();
    // A route reset clears the drawing and its video stamp before new data arrives.
    // The cached ranges must not recreate the previous video's duration text.
    bar.clear(); mockState.lastPreviewBarUpdate = null; mockVideoID = null;
    mockApp.bus.emit(CONTENT_EVENTS.PLAYER_UI_READY, { snapshot: {} as never });
    expect(next.querySelector("#sponsorBlockDurationAfterSkips")).toBeNull();
    expect(draw).not.toHaveBeenCalled();
    draw.mockRestore();
});

test("attaches existing shadow marks when its optional host arrives or is replaced", async () => {
    const player = document.querySelector(".bpx-player-container");
    player.querySelector(".bpx-player-shadow-progress-area").remove();
    createPreviewBar();
    const bar = getPreviewBar(), draw = jest.spyOn(bar, "set");
    for (let i = 0; i < 2; i++) {
        const shadow = document.createElement("div");
        shadow.className = "bpx-player-shadow-progress-area";
        const old = player.querySelector(".bpx-player-shadow-progress-area");
        if (old) old.replaceWith(shadow); else player.append(shadow);
        await Promise.resolve();
        expect(shadow.querySelector("#shadowPreviewbar")).not.toBeNull();
        checkPreviewbarState();
        expect(getPreviewBar()).toBe(bar);
        shadow.replaceChildren();
        await Promise.resolve();
        expect(shadow.querySelector("#shadowPreviewbar")).not.toBeNull();
    }
    expect(draw).not.toHaveBeenCalled();
    draw.mockRestore();
});

test("restores duration after inner label rewrites without readiness or marker redraws", async () => {
    const player = document.querySelector(".bpx-player-container");
    player.insertAdjacentHTML("beforeend", '<div class="bpx-player-ctrl-time"><span class="bpx-player-ctrl-time-label"></span></div>');
    createPreviewBar();
    const bar = getPreviewBar();
    bar.set([{ segment: [20, 30], actionType: ActionType.Skip, category: "sponsor" as Category,
        unsubmitted: false, showLarger: false, source: SponsorSourceType.Server }], 180);
    const draw = jest.spyOn(bar, "set");
    const time = player.querySelector(".bpx-player-ctrl-time");
    for (let i = 0; i < 2; i++) {
        time.innerHTML = '<span class="bpx-player-ctrl-time-label">00:15 / 03:00</span>';
        await Promise.resolve(); await Promise.resolve();
        expect(time.querySelector<HTMLElement>("#sponsorBlockDurationAfterSkips")?.innerText).toBe(" (2:50)");
        expect(time.querySelectorAll("#sponsorBlockDurationAfterSkips")).toHaveLength(1);
    }
    // A direct removal is recovered too, but a route reset must not revive old data.
    time.querySelector("#sponsorBlockDurationAfterSkips").remove();
    await Promise.resolve(); await Promise.resolve();
    expect(time.querySelector("#sponsorBlockDurationAfterSkips")).not.toBeNull();
    mockState.lastPreviewBarUpdate = null;
    time.replaceChildren();
    time.innerHTML = '<span class="bpx-player-ctrl-time-label"></span>';
    await Promise.resolve(); await Promise.resolve();
    expect(time.querySelector("#sponsorBlockDurationAfterSkips")).toBeNull();
    expect(draw).not.toHaveBeenCalled();
    draw.mockRestore();
});

test("keeps colors when floating player layers obscure the video area", async () => {
    createPreviewBar();
    const original = getPreviewBar();
    checkPreviewbarState();
    await Promise.resolve();
    expect(getPreviewBar()).toBe(original);
    document.querySelector("#previewbar").remove();
    checkPreviewbarState();
    expect(getPreviewBar()).toBe(original);
    expect(document.querySelectorAll("#previewbar")).toHaveLength(1);
});


test("initial readiness mounts and draws once, then only timeline changes redraw", async () => {
    jest.useFakeTimers();
    const draw = jest.spyOn(PreviewBar.prototype, "set");
    registerPreviewBarManager();
    let duration = 180;
    const video = document.querySelector("video");
    Object.defineProperty(video, "readyState", { value: 1 });
    const lifecycle = new PlayerUiLifecycle({
        capture: () => ({ video, hidden: false, pageLoaded: true,
            leftControls: null, rightControls: null, timeControl: null, progressBar: null }),
        isReady: () => true, duration: () => duration,
        ready: snapshot => mockApp.bus.emit(CONTENT_EVENTS.PLAYER_UI_READY, { snapshot }),
        invalidated: () => mockApp.bus.emit(CONTENT_EVENTS.PLAYER_UI_INVALIDATED, {}),
        timelineChanged: (video, duration) => mockApp.bus.emit(CONTENT_EVENTS.PLAYER_TIMELINE_CHANGED, { video, duration }),
    });
    try {
        lifecycle.requestCheck(); await jest.advanceTimersByTimeAsync(250);
        const original = getPreviewBar();
        expect(original).not.toBeNull();
        expect(draw).toHaveBeenCalledTimes(1);
        lifecycle.requestCheck(); await jest.advanceTimersByTimeAsync(250);
        expect(draw).toHaveBeenCalledTimes(1);
        duration = 240; Object.defineProperty(video, "duration", { value: duration }); lifecycle.requestCheck(); await jest.advanceTimersByTimeAsync(250);
        expect(getPreviewBar()).toBe(original);
        expect(draw).toHaveBeenCalledTimes(2);
    } finally {
        lifecycle.dispose(); draw.mockRestore(); jest.useRealTimers();
    }
});
