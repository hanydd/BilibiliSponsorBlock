/** @jest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { DescriptionPortPill } from "../src/render/DescriptionPortPill";
import { waitForPageReady } from "../src/content/pageReadiness";
import { BVID, NewVideoID, PortVideo } from "../src/types";

jest.mock("../src/config", () => ({ __esModule: true, default: { config: { showPortVideoButton: true } } }));
jest.mock("../src/content/pageReadiness", () => ({ waitForPageReady: jest.fn(() => Promise.resolve()) }));
jest.mock("../src/utils/injectedScriptMessageUtils", () => ({ getVideoDescriptionFromWindow: async () => "Description" }));
jest.mock("../src/render/MessageNotice", () => ({ showMessage: jest.fn() }));
jest.mock("../src/utils/cleanup", () => ({ addCleanupListener: jest.fn() }));
jest.mock("../src/components/DescriptionPortPillComponent", () => {
    const React = jest.requireActual("react");
    return { DescriptionPortPillComponent: class extends React.Component {
        state = { portVideo: null };
        setPortVideoData(portVideo) { this.setState({ portVideo }); }
        render() { return React.createElement("span", null, this.state.portVideo?.ytbID); }
    } };
});

const videoID = "BV1test+123" as NewVideoID;
const binding = { bvID: "BV1test" as BVID, ytbID: "youtube" as BVID, UUID: "binding" } as PortVideo;
let pill: DescriptionPortPill;
let lookup: jest.Mock;
const flush = async (action: () => void | Promise<void>) => { await act(async () => { await action(); }); };

beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, chrome: { i18n: { getMessage: () => "Bind" } } });
    jest.mocked(waitForPageReady).mockResolvedValue(undefined);
    document.body.innerHTML = '<div class="basic-desc-info"><span class="desc-info-text">Description</span></div><div class="video-toolbar-right"></div>';
    lookup = jest.fn();
    pill = new DescriptionPortPill(lookup, jest.fn(), jest.fn(), jest.fn(), jest.fn());
});
afterEach(async () => {
    await flush(() => pill.close());
    document.body.replaceChildren();
});

test.each([binding, null])("keeps the same root and binding across repeated readiness (%p)", async (portVideo) => {
    await flush(() => pill.setupDescription(videoID));
    await flush(() => pill.setPortVideoData(portVideo));
    const container = pill.inputContainer, root = pill.root;
    await flush(() => pill.setupDescription(videoID));
    expect(pill.root).toBe(root);
    expect(pill.inputContainer).toBe(container);
    expect(container.textContent).toBe(portVideo?.ytbID ?? "");
    expect(lookup).toHaveBeenCalledTimes(1);
});

test("initializes a different cid even when its BV and binding UUID match", async () => {
    await flush(() => pill.setupDescription(videoID));
    await flush(() => pill.setPortVideoData(binding));
    const oldRoot = pill.root;
    await flush(() => pill.setupDescription("BV1test+456" as NewVideoID));
    expect(pill.root).not.toBe(oldRoot);
    expect(lookup).toHaveBeenLastCalledWith("BV1test+456");
    expect(document.querySelectorAll("#bsbDescriptionContainer")).toHaveLength(1);
});

test("discards setup superseded while waiting for page hydration", async () => {
    let ready: () => void;
    jest.mocked(waitForPageReady).mockReturnValue(new Promise(resolve => { ready = resolve; }));
    const first = pill.setupDescription(videoID);
    const nextID = "BV2test+789" as NewVideoID;
    const latest = pill.setupDescription(nextID);
    await flush(async () => { ready(); await Promise.all([first, latest]); });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(nextID);
});

test("applies the latest binding if responses arrive before React commits, without polling", async () => {
    jest.useFakeTimers();
    try {
        await flush(async () => {
            await pill.setupDescription(videoID);
            pill.setPortVideoData(binding);
            pill.setPortVideoData({ ...binding, ytbID: "latest" as BVID });
        });
        expect(pill.inputContainer.textContent).toBe("latest");
        expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
});

test("closing during hydration does not resurrect either React root", async () => {
    let ready: () => void;
    jest.mocked(waitForPageReady).mockReturnValue(new Promise(resolve => { ready = resolve; }));
    const setup = pill.setupDescription(videoID);
    await flush(async () => { pill.close(); ready(); await setup; });
    expect(document.querySelector("#bsbDescriptionContainer")).toBeNull();
    expect(document.querySelector("#bsbPortButton")).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
});
