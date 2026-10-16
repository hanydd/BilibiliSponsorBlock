/** @jest-environment jsdom */
import { EventBus } from "../src/content/app/eventBus";
import { CONTENT_EVENTS } from "../src/content/app/events";
import type { ContentEventMap } from "../src/content/app/types";
import { registerSkipUIManager } from "../src/content/skipUIManager";
import { ActionType, SponsorTime } from "../src/types";

const mockState = { skipButtonControlBar: null };
const mockContentState = { skipNotices: [], activeSkipKeybindElement: null };
const mockApp = {
    bus: new EventBus<ContentEventMap>(), commands: { register: jest.fn(), execute: jest.fn() },
    ui: { getState: () => mockState, patchState: patch => Object.assign(mockState, patch) },
};
jest.mock("../src/content/app", () => ({ getContentApp: () => mockApp }));
jest.mock("../src/content/state", () => ({ get contentState() { return mockContentState; } }));
jest.mock("../src/config", () => ({ __esModule: true, default: { config: { skipToHighlightKeybind: null } } }));
jest.mock("../src/utils/categoryUtils", () => ({ getSkippingText: () => "Skip" }));
jest.mock("../src/utils/logger", () => ({ logUiLifecycle: jest.fn() }));
jest.mock("../src/utils/video", () => ({ getVideo: () => null }));
jest.mock("../src/render/SkipNotice", () => ({ __esModule: true, default: class {} }));
jest.mock("../src/content/skipRules/bridge", () => ({ isRuleEngineEnabled: () => false }));
jest.mock("../src/content/skipNoticeContentContainer", () => ({ getSkipNoticeContentContainer: jest.fn() }));

beforeEach(() => {
    jest.useFakeTimers();
    mockState.skipButtonControlBar = null; mockContentState.activeSkipKeybindElement = null;
    mockApp.bus = new EventBus<ContentEventMap>();
    Object.assign(globalThis, { chrome: { runtime: { getURL: path => path } } });
    registerSkipUIManager();
});
afterEach(() => { document.body.replaceChildren(); jest.useRealTimers(); });

test.each([false, true])("keeps the latest skip state across slow hydration without a timeout (disabled=%s)", async disabled => {
    const segment = { UUID: "poi", segment: [30, 30], actionType: ActionType.Poi, category: "poi_highlight" } as SponsorTime;
    mockApp.bus.emit(CONTENT_EVENTS.SKIP_BUTTON_STATE_CHANGED, { enabled: true, segment });
    const skip = mockState.skipButtonControlBar;
    expect(skip.container.isConnected).toBe(false);
    await jest.advanceTimersByTimeAsync(40000);
    if (disabled) mockApp.bus.emit(CONTENT_EVENTS.SKIP_BUTTON_STATE_CHANGED, { enabled: false, segment: null });
    expect(jest.getTimerCount()).toBe(0);
    const leftControls = document.createElement("div"), timeControl = document.createElement("span");
    leftControls.append(timeControl); document.body.append(leftControls);
    mockApp.bus.emit(CONTENT_EVENTS.PLAYER_UI_READY, { snapshot: {
        leftControls, timeControl, rightControls: null, video: null, progressBar: null, pageLoaded: true, hidden: false,
    } });
    expect(mockState.skipButtonControlBar).toBe(skip);
    expect(timeControl.nextElementSibling).toBe(skip.container);
    expect(skip.isEnabled()).toBe(!disabled);
    expect(mockContentState.activeSkipKeybindElement).toBe(disabled ? null : skip);
});
