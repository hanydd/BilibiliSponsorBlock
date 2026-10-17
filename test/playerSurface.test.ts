/** @jest-environment jsdom */
import { getPlayerSurface, getPlayerSurfaces, observePlayerSurfaces } from "../src/player/PlayerSurface";
import { getActivePlayerVideo, getControls } from "../src/utils/pageUtils";
import { isVisible } from "../src/utils/dom";

let pip: EventTarget & { window: Window | null };
let frame: HTMLIFrameElement;

beforeEach(() => {
    pip = Object.assign(new EventTarget(), { window: null });
    Object.defineProperty(window, "documentPictureInPicture", { configurable: true, value: pip });
    document.body.innerHTML = `<div id="bilibili-player"><div class="bpx-player-container">
        <div class="bpx-player-video-area"><div class="bpx-player-video-wrap"><video></video></div></div>
        <div class="bpx-player-control-bottom-right"></div>
    </div></div><iframe></iframe>`;
    frame = document.querySelector("iframe");
});

afterEach(() => {
    document.body.replaceChildren();
    delete window["documentPictureInPicture"];
});

function enter() {
    pip.window = frame.contentWindow;
    pip.dispatchEvent(Object.assign(new Event("enter"), { window: pip.window }));
    return frame.contentDocument;
}

test("preserves video identity through adoption, excluding previews and prepared replacements", () => {
    const video = getActivePlayerVideo();
    const host = video.closest(".bpx-player-video-area");
    const original = host.parentElement;
    const doc = enter();
    doc.body.innerHTML = `<div class="bpx-player-video-area"><div class="v-recommend-inline-player"><video></video></div>
        <video class="bpx-player-seamless-replacement"></video></div>`;
    doc.body.append(host);
    expect(getActivePlayerVideo()).toBe(video);
    expect(getPlayerSurface(video).kind).toBe("document-pip");
    expect(getPlayerSurface(video).overlayHost(video)).toBe(host);
    // Controls left on the page must not be treated as the floating player's hosts.
    expect(getControls()).toBeNull();
    original.append(host);
    pip.window = null;
    expect(getActivePlayerVideo()).toBe(video);
    expect(getPlayerSurface(video).kind).toBe("page");
    expect(getControls()).not.toBeNull();
    video.remove();
    expect(getActivePlayerVideo()).toBeNull();
});

test("keeps page controls clear while both floating surfaces use a small edge inset", () => {
    const host = document.querySelector(".bpx-player-video-area");
    host.getBoundingClientRect = () => ({ width: 480, height: 270 } as DOMRect);
    expect(getPlayerSurface(host).noticeLayout(host)).toEqual({ compact: true, bottom: 67 });
    host.parentElement.setAttribute("data-screen", "mini");
    expect(getPlayerSurface(host).noticeLayout(host)).toEqual({ compact: true, bottom: 12 });
    enter().body.append(host);
    expect(getPlayerSurface(host).noticeLayout(host)).toEqual({ compact: true, bottom: 12 });
    host.getBoundingClientRect = () => ({ width: 960, height: 540 } as DOMRect);
    expect(getPlayerSurface(host).noticeLayout(host)).toEqual({ compact: false, bottom: 12 });
});

test("mounts once in an already open PiP, disposes on close, and removes entry listeners on cleanup", () => {
    enter();
    const remove = jest.fn();
    const attach = jest.fn(() => remove);
    const stop = observePlayerSurfaces(attach);
    expect(attach).toHaveBeenCalledTimes(2);
    enter();
    expect(attach).toHaveBeenCalledTimes(2);
    frame.contentWindow.dispatchEvent(new Event("pagehide"));
    pip.window = null;
    expect(remove).toHaveBeenCalledTimes(1);
    stop();
    expect(remove).toHaveBeenCalledTimes(2);
    enter();
    expect(attach).toHaveBeenCalledTimes(2);
});

test("installs PiP styles before adoption and retains them after the site copies its styles", async () => {
    const stop = observePlayerSurfaces(surface => surface.mountStyles(".notice { position: absolute; }"));
    expect(document.querySelector("[data-sb-player-surface]")).toBeNull();
    const doc = enter();
    const style = doc.querySelector("[data-sb-player-surface]");
    expect(style.textContent).toContain("position: absolute");
    doc.head.append(doc.createElement("style"));
    await Promise.resolve();
    expect(doc.head.lastChild).toBe(style);
    expect(doc.querySelectorAll("[data-sb-player-surface]")).toHaveLength(1);
    stop();
    expect(style.isConnected).toBe(false);
});

test("hit-tests adopted elements in their owning document", () => {
    const doc = enter();
    const video = getActivePlayerVideo();
    doc.body.append(video.closest(".bpx-player-video-area"));
    Object.defineProperties(video, { offsetWidth: { value: 480 }, offsetHeight: { value: 270 } });
    doc.elementFromPoint = jest.fn(() => video);
    document.elementFromPoint = jest.fn(() => null);
    expect(isVisible(video)).toBe(true);
    expect(doc.elementFromPoint).toHaveBeenCalled();
    expect(document.elementFromPoint).not.toHaveBeenCalled();
});

test("falls back to the page when Document PiP is unsupported or closed", () => {
    const video = getActivePlayerVideo();
    enter();
    Object.defineProperty(frame.contentWindow, "closed", { configurable: true, value: true });
    expect(getPlayerSurfaces().map(s => s.kind)).toEqual(["page"]);
    delete window["documentPictureInPicture"];
    expect(getPlayerSurfaces().map(s => s.kind)).toEqual(["page"]);
    expect(getActivePlayerVideo()).toBe(video);
});

test.each([false, true])("overlapping script instances settle on one style node (newest cleanup first=%s)", async newestFirst => {
    const doc = enter();
    const stopOld = getPlayerSurface(doc).mountStyles(".notice { color: red; }");
    const original = doc.head.querySelector("[data-sb-player-surface]");
    // A reinjected bundle has its own module cache and surface registry.
    let freshGetSurface: typeof getPlayerSurface;
    jest.isolateModules(() => { freshGetSurface = require("../src/player/PlayerSurface").getPlayerSurface; });
    const stopNew = freshGetSurface(doc).mountStyles(".notice { color: blue; }");
    const changes: MutationRecord[] = [];
    const mutations = new MutationObserver(records => changes.push(...records));
    mutations.observe(doc.head, { childList: true });
    try {
        // A bounded microtask drain reproduces the loop without starving Jest's timeout.
        for (let i = 0; i < 12; i++) await Promise.resolve();
        expect(changes.length).toBeLessThan(6);
        expect(doc.head.querySelectorAll("[data-sb-player-surface]")).toHaveLength(1);
        expect(doc.head.lastChild).toBe(original);
        expect(original.textContent).toContain("blue");
        if (newestFirst) {
            stopNew();
            for (let i = 0; i < 4; i++) await Promise.resolve();
            // A stale observer must not resurrect styles after the current owner exits.
            expect(doc.head.querySelector("[data-sb-player-surface]")).toBeNull();
            stopOld();
        } else {
            stopOld();
            expect(original.isConnected).toBe(true);
            doc.head.append(doc.createElement("style"));
            for (let i = 0; i < 4; i++) await Promise.resolve();
            expect(doc.head.lastChild).toBe(original);
            // Recover when the site's stylesheet reconciliation removes our node.
            original.remove();
            for (let i = 0; i < 4; i++) await Promise.resolve();
            expect(doc.head.lastChild).toBe(original);
            stopNew();
        }
        for (let i = 0; i < 4; i++) await Promise.resolve();
        expect(doc.head.querySelector("[data-sb-player-surface]")).toBeNull();
    } finally {
        mutations.disconnect();
        stopOld(); stopNew();
    }
});
