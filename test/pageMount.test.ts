/** @jest-environment jsdom */
import * as React from "react";
import { hydrateRoot } from "react-dom/client";
import { isPageMountReady, readPageMountState } from "../src/document/pageMount";

afterEach(() => document.body.replaceChildren());

test("SSR Next.js markup and data do not signal hydration", () => {
    document.body.innerHTML = '<div id="__next"><button>SSR</button></div><script id="__NEXT_DATA__"></script>';
    expect(readPageMountState()).toMatchObject({ next: true, reactHydrated: false });
    expect(isPageMountReady(readPageMountState())).toBe(false);
});

test("waits for a real React root hydration commit", async () => {
    document.body.innerHTML = '<div id="__next"><div>Ready</div></div>';
    const container = document.querySelector("#__next");
    const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    let root: ReturnType<typeof hydrateRoot>;
    try {
        await React.act(async () => {
            root = hydrateRoot(container, React.createElement("div", null, "Ready"));
            expect(isPageMountReady(readPageMountState())).toBe(false);
        });
        expect(isPageMountReady(readPageMountState())).toBe(true);
    } finally {
        await React.act(async () => root?.unmount());
        delete actEnvironment.IS_REACT_ACT_ENVIRONMENT;
    }
});

test("reads the committed current fiber rather than the stale attached alternate", () => {
    document.body.innerHTML = '<div id="__next"></div>';
    const root = document.querySelector("#__next") as Element & Record<string, unknown>;
    const current = { memoizedState: { isDehydrated: true } };
    root.__reactContainer$test = { memoizedState: { isDehydrated: false }, stateNode: { current } };
    expect(isPageMountReady(readPageMountState())).toBe(false);
    current.memoizedState.isDehydrated = false;
    expect(isPageMountReady(readPageMountState())).toBe(true);
    root.replaceWith(document.createElement("div"));
    expect(isPageMountReady(readPageMountState())).toBe(false);
});

test.each(["__vue__", "__vue_app__"])("preserves the Vue %s mount signal", (key) => {
    document.body.innerHTML = '<div id="app"></div>';
    const app = document.querySelector("#app") as Element & Record<string, unknown>;
    expect(isPageMountReady(readPageMountState())).toBe(false);
    app[key] = {};
    expect(isPageMountReady(readPageMountState())).toBe(true);
});
