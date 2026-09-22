/** @jest-environment jsdom */
import { DynamicSponsorOption } from "../src/types";

jest.mock("../src/config", () => ({ __esModule: true, default: { config: {} } }));
jest.mock("../src/thumbnail-utils/thumbnails", () => ({ insertSBIconDefinition: jest.fn() }));
jest.mock("../src/utils/cleanup", () => ({ addCleanupListener: jest.fn() }));

let Config: typeof import("../src/config").default;
let addCleanupListener: typeof import("../src/utils/cleanup").addCleanupListener;
let CommentListener: typeof import("../src/render/DynamicAndCommentSponsorBlock").CommentListener;

function component(name: string, parent: Node, html = "") {
    const host = document.createElement(name);
    host.attachShadow({ mode: "open" }).innerHTML = html;
    parent.appendChild(host);
    return host;
}

function fixture(goods = true, root = component("bili-comments", document.body, '<div id="feed"></div>')) {
    const thread = component("bili-comment-thread-renderer", root.shadowRoot.querySelector("#feed"));
    const comment = component("bili-comment-renderer", thread.shadowRoot,
        '<div id="content"></div><div id="user-avatar" data-user-profile-id="123"></div>');
    const content = comment.shadowRoot.querySelector<HTMLElement>("#content");
    const rich = component("bili-rich-text", content, goods ? '<a data-type="goods">product</a>' : "");
    const user = component("bili-comment-user-info", comment.shadowRoot, '<span id="user-level"></span>');
    const actions = component("bili-comment-action-buttons-renderer", comment.shadowRoot, '<button id="reply"></button>');
    return { root, thread, comment, content, rich, user, actions };
}

beforeEach(async () => {
    jest.resetModules();
    Config = (await import("../src/config")).default;
    ({ addCleanupListener } = await import("../src/utils/cleanup"));
    ({ CommentListener } = await import("../src/render/DynamicAndCommentSponsorBlock"));
    jest.useFakeTimers();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    (global as unknown as { chrome: unknown }).chrome = { i18n: { getMessage: (key: string) => key } };
    Object.assign(Config.config, {
        dynamicAndCommentSponsorBlocker: true,
        commentSponsorBlock: true,
        commentSponsorReplyBlock: false,
        dynamicAndCommentSponsorWhitelistedChannels: false,
        whitelistedChannels: [],
        dynamicSponsorSelections: [{ name: "dynamicSponsor_sponsor", option: DynamicSponsorOption.Hide }],
    });
});

afterEach(() => {
    for (const [cleanup] of (addCleanupListener as jest.Mock).mock.calls) cleanup();
    jest.clearAllMocks();
    jest.useRealTimers();
    document.body.replaceChildren();
});

test("scans existing comments immediately and keeps one listener and one set of controls", () => {
    const f = fixture();
    CommentListener();
    CommentListener();
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(5000);
    CommentListener();
    jest.advanceTimersByTime(10000);
    expect(f.content.style.display).toBe("none");
    expect(f.user.shadowRoot.querySelectorAll("#commentSponsorLabel")).toHaveLength(1);
    expect(f.actions.shadowRoot.querySelectorAll("#showDynamicSponsor")).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(0);
    expect(addCleanupListener).toHaveBeenCalledTimes(1);
    f.actions.shadowRoot.querySelector<HTMLButtonElement>("#showDynamicSponsor").click();
    jest.advanceTimersByTime(5000);
    expect(f.content.style.display).toBe("block");
});

test("rechecks late goods links even after scanning a non-ad comment", () => {
    const f = fixture(false);
    CommentListener();
    expect(f.content.style.display).toBe("");
    f.rich.shadowRoot.innerHTML = '<a data-type="goods">product</a>';
    jest.advanceTimersByTime(4999);
    expect(f.content.style.display).toBe("");
    jest.advanceTimersByTime(1);
    expect(f.content.style.display).toBe("none");
});

test("uses the single delayed scan for a host whose shadow root arrives later", () => {
    CommentListener();
    jest.advanceTimersByTime(1000);
    const root = document.createElement("bili-comments");
    document.body.append(root);
    jest.advanceTimersByTime(1000);
    root.attachShadow({ mode: "open" }).innerHTML = '<div id="feed"></div>';
    const f = fixture(true, root);
    jest.advanceTimersByTime(5000);
    expect(f.content.style.display).toBe("none");
});

test("handles independent comment hydration, late controls and replacement roots", () => {
    const f = fixture();
    const incomplete = document.createElement("bili-comment-thread-renderer");
    f.root.shadowRoot.querySelector("#feed").prepend(incomplete);
    f.actions.shadowRoot.replaceChildren();
    f.user.shadowRoot.replaceChildren();
    CommentListener();
    expect(f.content.style.display).toBe("");
    f.actions.shadowRoot.innerHTML = '<button id="reply"></button>';
    f.user.shadowRoot.innerHTML = '<span id="user-level"></span>';
    jest.advanceTimersByTime(5000);
    expect(f.content.style.display).toBe("none");
    expect(f.user.shadowRoot.querySelector("#commentSponsorLabel")).not.toBeNull();
    f.root.remove();
    const replacement = fixture();
    CommentListener();
    expect(jest.getTimerCount()).toBe(0);
    expect(replacement.content.style.display).toBe("none");
});

test("observes feed changes without waiting for the compensation timer", async () => {
    const f = fixture();
    CommentListener();
    const added = fixture(true, f.root);
    await Promise.resolve();
    expect(added.content.style.display).toBe("none");
});

test("respects whitelist, overlay and disabled options", () => {
    const f = fixture();
    Config.config.whitelistedChannels = [{ id: "123" } as typeof Config.config.whitelistedChannels[number]];
    CommentListener();
    expect(f.content.style.display).toBe("");
    Config.config.whitelistedChannels = [];
    Config.config.dynamicSponsorSelections[0].option = DynamicSponsorOption.Disabled;
    jest.advanceTimersByTime(5000);
    expect(f.user.shadowRoot.querySelector("#commentSponsorLabel")).toBeNull();
    Config.config.dynamicSponsorSelections[0].option = DynamicSponsorOption.ShowOverlay;
    CommentListener();
    expect(f.user.shadowRoot.querySelector("#commentSponsorLabel")).not.toBeNull();
    expect(f.content.style.display).toBe("");
});

test("handles delayed replies without hiding them again after the user expands them", () => {
    const f = fixture();
    Config.config.commentSponsorReplyBlock = true;
    CommentListener();
    const replies = component("bili-comment-replies-renderer", f.thread.shadowRoot);
    const reply = component("bili-comment-reply-renderer", replies.shadowRoot);
    const more = component("bili-text-button", replies.shadowRoot, "<button>more</button>");
    jest.advanceTimersByTime(5000);
    expect(reply.style.display).toBe("none");
    more.shadowRoot.querySelector("button").click();
    CommentListener();
    expect(reply.style.display).toBe("");
});

test("pauses in hidden tabs, resumes on visibility change, and stops on cleanup", async () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    const f = fixture();
    CommentListener();
    jest.advanceTimersByTime(5000);
    expect(f.content.style.display).toBe("");
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(f.content.style.display).toBe("none");
    (addCleanupListener as jest.Mock).mock.calls[0][0]();
    const added = fixture(true, f.root);
    await Promise.resolve();
    jest.advanceTimersByTime(10000);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(added.content.style.display).toBe("");
    expect(jest.getTimerCount()).toBe(0);
});

test("cancels the pending compensation on cleanup and never schedules a second one", () => {
    CommentListener();
    expect(jest.getTimerCount()).toBe(1);
    (addCleanupListener as jest.Mock).mock.calls[0][0]();
    expect(jest.getTimerCount()).toBe(0);
    CommentListener();
    expect(jest.getTimerCount()).toBe(0);
});

test("observes late goods inside nested shadow roots after compensation without polling", async () => {
    const f = fixture(false);
    CommentListener();
    jest.advanceTimersByTime(5000);
    f.rich.shadowRoot.innerHTML = '<a data-type="goods">product</a>';
    jest.advanceTimersByTime(60000);
    expect(f.content.style.display).toBe("");
    expect(jest.getTimerCount()).toBe(0);
    await Promise.resolve();
    expect(f.content.style.display).toBe("none");
});

test("discovers comment sections opened after compensation and their replacements", async () => {
    CommentListener();
    jest.advanceTimersByTime(5000);
    const first = fixture();
    await Promise.resolve();
    expect(first.content.style.display).toBe("none");

    // A dynamic card can insert its entire comment container at once.
    const card = document.createElement("div");
    const root = component("bili-comments", card, '<div id="feed"></div>');
    const replacement = fixture(true, root);
    first.root.replaceWith(card);
    await Promise.resolve();
    expect(replacement.content.style.display).toBe("none");
    expect(jest.getTimerCount()).toBe(0);

    // Removing the container must disconnect the old shadow-root observer.
    card.remove();
    await Promise.resolve();
    const detachedComment = fixture(true, root);
    const detachedScan = jest.spyOn(detachedComment.rich.shadowRoot, "querySelector");
    await Promise.resolve();
    expect(detachedScan).not.toHaveBeenCalled();
    detachedScan.mockRestore();
});

test("ignores unrelated page mutations and stops discovering roots after cleanup", async () => {
    const f = fixture(false);
    CommentListener();
    jest.advanceTimersByTime(5000);
    const scan = jest.spyOn(f.rich.shadowRoot, "querySelector");
    document.body.append(document.createElement("div"));
    await Promise.resolve();
    expect(scan).not.toHaveBeenCalled();
    scan.mockRestore();

    (addCleanupListener as jest.Mock).mock.calls[0][0]();
    const late = fixture();
    await Promise.resolve();
    expect(late.content.style.display).toBe("");
    expect(jest.getTimerCount()).toBe(0);
});

test("observes independently hydrated comment components and goods attributes", async () => {
    const f = fixture(false);
    CommentListener();
    jest.advanceTimersByTime(5000);
    const added = fixture(false, f.root);
    await Promise.resolve();
    added.rich.shadowRoot.innerHTML = '<a>product</a>';
    await Promise.resolve();
    expect(added.content.style.display).toBe("");
    added.rich.shadowRoot.querySelector("a").setAttribute("data-type", "goods");
    await Promise.resolve();
    expect(added.content.style.display).toBe("none");
    expect(jest.getTimerCount()).toBe(0);
});
