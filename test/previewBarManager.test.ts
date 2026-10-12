/** @jest-environment jsdom */
import { checkPreviewbarState, createPreviewBar, getPreviewBar, resetPreviewBarState } from "../src/content/previewBarManager";

const mockState = { previewBar: null, selectedSegment: null, lastPreviewBarUpdate: null };
const mockApp = {
    ui: { getState: () => mockState, patchState: (patch) => Object.assign(mockState, patch) },
    commands: { execute: jest.fn() }, bus: { emit: jest.fn() },
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
    isPlayerUiReady: () => true, waitForPlayerUiReady: () => Promise.resolve({}),
}));
jest.mock("../src/render/ChapterVote", () => ({ ChapterVote: class { setVisibility() {} } }));

beforeEach(() => {
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
    await Promise.resolve();
    expect(getPreviewBar()).not.toBe(original);
});
