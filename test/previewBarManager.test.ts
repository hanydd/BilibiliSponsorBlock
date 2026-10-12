/** @jest-environment jsdom */
import { checkPreviewbarState, createPreviewBar, getPreviewBar, registerPreviewBarManager, resetPreviewBarState } from "../src/content/previewBarManager";

import PreviewBar from "../src/js-components/previewBar";
import { PlayerUiLifecycle } from "../src/content/playerUiLifecycle";
import { EventBus } from "../src/content/app/eventBus";
import { CONTENT_EVENTS } from "../src/content/app/events";
import type { ContentEventMap } from "../src/content/app/types";

const mockState = { previewBar: null, selectedSegment: null, lastPreviewBarUpdate: null };
const mockApp = {
    ui: { getState: () => mockState, patchState: (patch) => Object.assign(mockState, patch) },
    commands: { execute: jest.fn(), register: jest.fn() }, bus: new EventBus<ContentEventMap>(),
};
jest.mock("../src/content/app", () => ({ getContentApp: () => mockApp }));
jest.mock("../src/content/state", () => ({ contentState: { sponsorTimes: [], sponsorTimesSubmitting: [] } }));
jest.mock("../src/config", () => ({ __esModule: true, default: { config: { barTypes: {} } } }));
jest.mock("../src/utils", () => ({ __esModule: true, default: class {} }));
jest.mock("../src/utils/categoryUtils", () => ({ shortCategoryName: () => "Sponsor" }));
jest.mock("../src/utils/logger", () => ({ logUiLifecycle: jest.fn() }));
jest.mock("../src/utils/video", () => ({
    getVideo: () => document.querySelector("#bilibili-player video"), getVideoID: () => "BV1test+123",
}));
jest.mock("../src/content/playerUi", () => ({
    isPlayerUiReady: () => true,
}));
jest.mock("../src/render/ChapterVote", () => ({ ChapterVote: class { setVisibility() {} } }));

beforeEach(() => {
    mockApp.bus = new EventBus<ContentEventMap>();
    document.body.innerHTML = `<div class="v-recommend-inline-player"><div class="bpx-player-progress"></div></div>
        <div id="bilibili-player"><div class="bpx-player-container">
            <video></video><div class="bpx-player-video-area">
                <div class="bpx-player-progress"></div><div class="bpx-player-shadow-progress-area"></div>
            </div></div></div><div id="overlay"></div>`;
    const parent = document.querySelector("#bilibili-player .bpx-player-progress");
    Object.defineProperties(parent, { offsetWidth: { value: 800 }, offsetHeight: { value: 4 } });
    Object.defineProperty(document.querySelector("video"), "duration", { value: 180 });
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

test("keeps colors when floating player layers obscure the video area", async () => {
    createPreviewBar();
    const original = getPreviewBar();
    checkPreviewbarState();
    await Promise.resolve();
    expect(getPreviewBar()).toBe(original);
    original.container.remove();
    checkPreviewbarState();
    expect(getPreviewBar()).toBeNull();
    createPreviewBar();
    expect(getPreviewBar()).not.toBe(original);
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
        duration = 240; lifecycle.requestCheck(); await jest.advanceTimersByTimeAsync(250);
        expect(getPreviewBar()).toBe(original);
        expect(draw).toHaveBeenCalledTimes(2);
    } finally {
        lifecycle.dispose(); draw.mockRestore(); jest.useRealTimers();
    }
});
