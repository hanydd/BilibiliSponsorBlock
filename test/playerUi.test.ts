/** @jest-environment jsdom */
import { isPlayerUiReady, PlayerUIReadySnapshot } from "../src/content/playerUi";

jest.mock("../src/utils/video", () => ({ getVideo: jest.fn() }));
jest.mock("../src/content/state", () => ({ getPageLoaded: jest.fn() }));
jest.mock("../src/utils/logger", () => ({
    logUiLifecycle: jest.fn(), describeElement: jest.fn(), describeVideo: jest.fn(),
}));
jest.mock("../src/utils/pageUtils", () => ({
    ...jest.requireActual("../src/utils/pageUtils"),
    getControls: jest.fn(), getLeftControls: jest.fn(), getProgressBar: jest.fn(),
}));

afterEach(() => {
    document.body.replaceChildren();
    jest.useRealTimers();
});

function snapshot(): PlayerUIReadySnapshot {
    const control = document.createElement("div");
    Object.defineProperties(control, { offsetWidth: { value: 100 }, offsetHeight: { value: 10 } });
    control.getBoundingClientRect = () => ({ width: 100, height: 10 } as DOMRect);
    const video = document.createElement("video");
    Object.defineProperties(video, { readyState: { value: 1 }, duration: { value: 180.16 } });
    document.body.append(control, video);
    return { hidden: false, pageLoaded: true, leftControls: control, rightControls: control, timeControl: null, progressBar: control, video };
}

test("requires page hydration even when media and SSR controls look ready", () => {
    expect(isPlayerUiReady({ ...snapshot(), pageLoaded: false })).toBe(false);
    expect(isPlayerUiReady(snapshot())).toBe(true);
});

test("still requires metadata, controls, a progress bar, and a visible tab", () => {
    expect(isPlayerUiReady({ ...snapshot(), video: document.createElement("video") })).toBe(false);
    expect(isPlayerUiReady({ ...snapshot(), rightControls: null })).toBe(false);
    expect(isPlayerUiReady({ ...snapshot(), timeControl: null, progressBar: document.createElement("div") })).toBe(false);
    expect(isPlayerUiReady({ ...snapshot(), hidden: true })).toBe(false);
});

test("rejects detached controls even if their old geometry is still available", () => {
    const state = snapshot();
    state.rightControls.remove();
    expect(isPlayerUiReady(state)).toBe(false);
});
