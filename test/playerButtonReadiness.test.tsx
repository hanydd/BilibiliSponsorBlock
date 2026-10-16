/** @jest-environment jsdom */
import { PlayerButton } from "../src/render/PlayerButton";
import { SkipButtonControlBar } from "../src/js-components/skipButtonControlBar";
import { PlayerUIReadySnapshot, waitForPlayerUiReady } from "../src/content/playerUi";
import type { SponsorTime } from "../src/types";

const mockRoots: Array<{ container: HTMLElement; render: jest.Mock }> = [];
jest.mock("react-dom/client", () => ({ createRoot: (container: HTMLElement) => {
    const root = { container, render: jest.fn() };
    mockRoots.push(root);
    return root;
} }));
jest.mock("../src/components/playerButtons/PlayerButtonGroupComponent", () => ({
    __esModule: true, default: () => null,
}));
jest.mock("../src/config", () => ({ __esModule: true, default: { config: {} } }));
jest.mock("../src/content/playerUi", () => ({ waitForPlayerUiReady: jest.fn() }));
jest.mock("../src/utils/logger", () => ({ logUiLifecycle: jest.fn() }));

function host(): PlayerUIReadySnapshot {
    const leftControls = document.createElement("div");
    const rightControls = document.createElement("div");
    const timeControl = document.createElement("span");
    leftControls.append(timeControl);
    document.body.append(leftControls, rightControls);
    return { leftControls, rightControls, timeControl, video: null, progressBar: null,
        pageLoaded: true, hidden: false };
}

function commit() {
    const { container, render } = mockRoots[0];
    container.innerHTML = '<button id="infoButton"><img id="infoImage"></button>' +
        '<button id="submitButton"><img id="submitImage"></button>';
    const group = { setSetgments: jest.fn() };
    render.mock.calls[0][0].ref(group);
    return group;
}

beforeEach(() => {
    jest.useFakeTimers(); mockRoots.length = 0; jest.clearAllMocks();
    Object.assign(globalThis, { chrome: { runtime: { getURL: path => path } } });
});
afterEach(() => { document.body.replaceChildren(); jest.useRealTimers(); });

const buttons = () => new PlayerButton(jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn());

test("ready snapshots mount without another readiness wait; concurrent calls share the React commit", async () => {
    const player = buttons(), snapshot = host();
    const first = player.createButtons(snapshot), second = player.createButtons(snapshot);
    const pending = player.createButtons();
    expect(waitForPlayerUiReady).not.toHaveBeenCalled();
    expect(mockRoots).toHaveLength(1);
    expect(player.container.parentElement).toBe(snapshot.rightControls);
    commit();
    expect(await first).toBe(await second);
    expect(await pending).toBe(await first);
});

test("waits once for late readiness, then tolerates a slow commit and keeps the latest draft", async () => {
    const player = buttons(), snapshot = host();
    let ready: (snapshot: PlayerUIReadySnapshot) => void;
    jest.mocked(waitForPlayerUiReady).mockReturnValue(new Promise(resolve => { ready = resolve; }));
    const complete = jest.fn();
    const waiting = player.createButtons().then(complete);
    const concurrent = player.createButtons();
    await jest.advanceTimersByTimeAsync(40000);
    expect(mockRoots).toHaveLength(0);
    ready(snapshot); await Promise.resolve();
    player.updateSegmentSubmitting([{ segment: [5] }] as SponsorTime[]);
    const latest = [{ segment: [5, 15] }] as SponsorTime[];
    player.updateSegmentSubmitting(latest);
    await jest.advanceTimersByTimeAsync(40000);
    expect(complete).not.toHaveBeenCalled();
    const group = commit(); await Promise.all([waiting, concurrent]);
    expect(waitForPlayerUiReady).toHaveBeenCalledTimes(1);
    expect(group.setSetgments).toHaveBeenCalledWith(latest);
});

test("moves a pending React root to a replaced host and never moves it back on commit", async () => {
    const player = buttons(), old = host();
    const first = player.createButtons(old);
    old.rightControls.remove();
    const next = host();
    const second = player.createButtons(next);
    expect(player.container.parentElement).toBe(next.rightControls);
    commit(); await Promise.all([first, second]);
    expect(player.container.parentElement).toBe(next.rightControls);
    expect(waitForPlayerUiReady).not.toHaveBeenCalled();
    expect(mockRoots).toHaveLength(1);
});

test("discards a detached snapshot and resumes on the current host", async () => {
    const player = buttons(), old = host(), next = host();
    old.rightControls.remove();
    jest.mocked(waitForPlayerUiReady).mockResolvedValue(next);
    const waiting = player.createButtons(old); await jest.advanceTimersByTimeAsync(0);
    commit(); await waiting;
    expect(waitForPlayerUiReady).toHaveBeenCalledTimes(1);
    expect(player.container.parentElement).toBe(next.rightControls);
});

test("skip buttons use the supplied time anchor without a private waiter", () => {
    const skip = new SkipButtonControlBar({ skip: jest.fn(), selectSegment: jest.fn() });
    const old = host(), next = host();
    skip.attachToPage({ ...old, timeControl: null });
    expect(skip.container.isConnected).toBe(false);
    old.timeControl.remove();
    skip.attachToPage(old);
    expect(skip.container.isConnected).toBe(false);
    skip.attachToPage(next);
    expect(next.timeControl.nextElementSibling).toBe(skip.container);
    expect(waitForPlayerUiReady).not.toHaveBeenCalled();
});
