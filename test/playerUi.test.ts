/** @jest-environment jsdom */
import { capturePlayerUiReadySnapshot, isPlayerUiReady, PlayerUIReadySnapshot } from "../src/content/playerUi";
import { getVideo } from "../src/utils/video";

jest.mock("../src/utils/video", () => ({ getVideo: jest.fn() }));
jest.mock("../src/content/state", () => ({ getPageLoaded: jest.fn() }));
jest.mock("../src/utils/logger", () => ({
    logUiLifecycle: jest.fn(), describeElement: jest.fn(), describeVideo: jest.fn(),
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

test("captures the video once and reads every host from the same root without rescanning the document", () => {
    document.body.innerHTML = '<div class="bpx-player-container"><video></video>' +
        '<div class="bpx-player-control-bottom-left"><span class="bpx-player-ctrl-time"></span></div>' +
        '<div class="bpx-player-control-bottom-right"></div><div class="bpx-player-progress-schedule"></div>' +
        '<div class="v-recommend-inline-player"><div class="bpx-player-control-bottom-right"></div></div></div>';
    jest.mocked(getVideo).mockReturnValue(document.querySelector("video"));
    const scan = jest.spyOn(document, "querySelectorAll");
    const captured = capturePlayerUiReadySnapshot();
    expect(getVideo).toHaveBeenCalledTimes(1);
    expect(scan).not.toHaveBeenCalled();
    expect(captured.leftControls).toBe(document.querySelector(".bpx-player-control-bottom-left"));
    expect(captured.timeControl).toBe(captured.leftControls.firstElementChild);
    expect(captured.rightControls).toBe(document.querySelector(".bpx-player-control-bottom-right"));
    expect(captured.progressBar).toBe(document.querySelector(".bpx-player-progress-schedule"));
    scan.mockRestore();
});
