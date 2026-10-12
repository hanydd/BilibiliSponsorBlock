/** @jest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { CategoryPill } from "../src/render/CategoryPill";
import { getPageLoaded } from "../src/content/state";
import { ActionType, SponsorTime } from "../src/types";

jest.mock("../src/config", () => ({ __esModule: true, default: { config: {} } }));
jest.mock("../src/content/state", () => ({ getPageLoaded: jest.fn(() => true) }));
jest.mock("../src/utils/logger", () => ({ logUiLifecycle: jest.fn() }));
jest.mock("../src/utils/cleanup", () => ({ addCleanupListener: jest.fn() }));
jest.mock("../src/components/CategoryPillComponent", () => {
    const React = jest.requireActual("react");
    return { __esModule: true, default: class extends React.Component {
        state = { segment: null, show: false };
        render() {
            return React.createElement("span", { hidden: !this.state.show }, this.state.segment?.category);
        }
    } };
});

const segment = (category = "sponsor") => ({ UUID: category, category, actionType: ActionType.Full, segment: [0, 0] }) as SponsorTime;
let pill: CategoryPill;
const flush = async (action: () => void | Promise<void>) => { await act(async () => { await action(); }); };
const title = () => document.querySelector("h1");

beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    jest.mocked(getPageLoaded).mockReturnValue(true);
    document.body.innerHTML = '<div class="video-info-container"><h1>Video A</h1></div>';
    pill = new CategoryPill();
});
afterEach(async () => { await flush(() => pill.close()); jest.useRealTimers(); });

async function mount() {
    await flush(async () => {
        await pill.setSegment(segment());
        await pill.attachToPage(jest.fn());
    });
}

test("restores the same React root when SPA rewrites the title or replaces its container", async () => {
    await mount();
    const container = pill.container;
    await flush(() => { title().textContent = "Video B"; });
    expect(title().firstElementChild).toBe(container);
    expect(container.textContent).toBe("sponsor");
    await flush(() => { document.body.innerHTML = '<div class="video-info-container"><h1>Video C</h1></div>'; });
    expect(title().firstElementChild).toBe(container);
    expect(document.querySelectorAll("#categoryPill")).toHaveLength(1);
});

test("clears a full label on reset and applies the latest segment before React commits", async () => {
    await flush(async () => {
        await pill.setSegment(segment());
        await pill.attachToPage(jest.fn());
        pill.resetSegment();
    });
    expect(pill.container.firstElementChild).toHaveProperty("hidden", true);
    await flush(async () => { await pill.setSegment(segment("selfpromo")); });
    expect(pill.container.textContent).toBe("selfpromo");
    await flush(() => { pill.resetSegment(); title().textContent = "Unlabelled video"; });
    expect(pill.container.firstElementChild).toHaveProperty("hidden", true);
});

test("can reapply the same cached segment immediately after reset", async () => {
    const cached = segment();
    await flush(async () => { await pill.attachToPage(jest.fn()); await pill.setSegment(cached); });
    await flush(async () => { pill.resetSegment(); await pill.setSegment(cached); });
    expect(pill.container.firstElementChild).toHaveProperty("hidden", false);
    expect(pill.container.textContent).toBe("sponsor");
});

test("waits for initial hydration and mounts the latest state even if title appears later", async () => {
    jest.useFakeTimers();
    jest.mocked(getPageLoaded).mockReturnValue(false);
    document.body.innerHTML = "";
    const attaching = pill.attachToPage(jest.fn());
    await pill.setSegment(segment());
    expect(pill.container).toBeUndefined();
    await jest.advanceTimersByTimeAsync(11000);
    expect(pill.container).toBeUndefined();
    pill.resetSegment();
    await pill.setSegment(segment("selfpromo"));
    jest.mocked(getPageLoaded).mockReturnValue(true);
    await flush(async () => { await jest.advanceTimersByTimeAsync(100); await attaching; });
    await flush(() => { document.body.innerHTML = '<div class="video-info-container"><h1>Latest</h1></div>'; });
    expect(pill.container.textContent).toBe("selfpromo");
});

test("concurrent setup is idempotent and cleanup stops pending work and mutation recovery", async () => {
    await flush(async () => {
        await Promise.all([pill.attachToPage(jest.fn()), pill.attachToPage(jest.fn())]);
        await pill.setSegment(segment());
    });
    expect(document.querySelectorAll("#categoryPill")).toHaveLength(1);
    await flush(() => { pill.close(); pill.close(); });
    await flush(async () => { title().textContent = "After cleanup"; await pill.setSegment(segment()); await pill.attachToPage(jest.fn()); });
    expect(document.querySelector("#categoryPill")).toBeNull();
});

test("closing before hydration cannot resurrect the pill", async () => {
    jest.useFakeTimers();
    jest.mocked(getPageLoaded).mockReturnValue(false);
    const attaching = pill.attachToPage(jest.fn());
    pill.close();
    await flush(async () => { await jest.advanceTimersByTimeAsync(100); await attaching; });
    expect(document.querySelector("#categoryPill")).toBeNull();
});
