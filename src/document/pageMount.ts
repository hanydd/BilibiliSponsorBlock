interface ReactRootFiber {
    stateNode?: { current?: { memoizedState?: { isDehydrated?: boolean } } };
}

export interface PageMountState {
    vue2: boolean;
    vue3: boolean;
    next: boolean;
    reactHydrated: boolean;
}

/** Must run in the MAIN world: framework properties are hidden from content scripts. */
export function readPageMountState(): PageMountState {
    const app = document.querySelector("#app") as Element & { __vue__?: unknown; __vue_app__?: unknown };
    const nextRoot = document.querySelector("#__next");
    const next = !!nextRoot || !!document.querySelector("#__NEXT_DATA__");
    let reactHydrated = false;

    if (nextRoot) {
        // Next's SSR data and router.isReady can exist before hydration. React
        // attaches this private key when hydrateRoot starts; only the committed
        // FiberRoot.current changing isDehydrated to false signals root hydration.
        // Do not inspect the attached fiber's own state: it can be the stale alternate.
        const key = Object.keys(nextRoot).find((name) => name.startsWith("__reactContainer$"));
        const fiber = key ? (nextRoot as unknown as Record<string, ReactRootFiber>)[key] : null;
        reactHydrated = fiber?.stateNode?.current?.memoizedState?.isDehydrated === false;
    }

    return { vue2: !!app?.__vue__, vue3: !!app?.__vue_app__, next, reactHydrated };
}

export function isPageMountReady(state: PageMountState): boolean {
    return state.next ? state.reactHydrated : state.vue2 || state.vue3;
}
