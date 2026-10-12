import { addCleanupListener } from "../utils/cleanup";
import { getPlayerTimelineDuration } from "../utils/playerDuration";
import { getContentApp } from "./app";
import { CONTENT_EVENTS } from "./app/events";
import { PlayerUiLifecycle } from "./playerUiLifecycle";
import { describeElement, describeVideo, logUiLifecycle } from "../utils/logger";
import { getControls, getLeftControls, getPlayerContainer, getProgressBar, isVisible } from "../utils/pageUtils";
import { getVideo } from "../utils/video";
import { getPageLoaded } from "./state";

export interface PlayerUIReadySnapshot {
    hidden: boolean;
    pageLoaded: boolean;
    leftControls: HTMLElement | null;
    rightControls: HTMLElement | null;
    timeControl: HTMLElement | null;
    progressBar: HTMLElement | null;
    video: HTMLVideoElement | null;
}

// Host identity is stabilized by PlayerUiLifecycle; this only checks layout.
function hasUsableLayout(element: HTMLElement | null): boolean {
    if (!element?.isConnected || !isVisible(element)) {
        return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function hasUsableVideo(video: HTMLVideoElement | null): boolean {
    if (!video) {
        return false;
    }

    return video.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(video.duration) && video.duration > 0;
}

export function capturePlayerUiReadySnapshot(): PlayerUIReadySnapshot {
    const video = getVideo();
    const player = getPlayerContainer(video);
    const leftControls = getLeftControls(player);
    return {
        hidden: document.hidden,
        pageLoaded: getPageLoaded(),
        leftControls,
        timeControl: leftControls?.querySelector<HTMLElement>(".bpx-player-ctrl-time") ?? null,
        rightControls: getControls(player),
        progressBar: getProgressBar(player),
        video,
    };
}

export function summarizePlayerUiSnapshot(snapshot: PlayerUIReadySnapshot): Record<string, unknown> {
    return {
        hidden: snapshot.hidden,
        pageLoaded: snapshot.pageLoaded,
        leftControls: describeElement(snapshot.leftControls),
        leftControlsVisible: isVisible(snapshot.leftControls),
        leftControlsRectReady: hasUsableLayout(snapshot.leftControls),
        rightControls: describeElement(snapshot.rightControls),
        rightControlsVisible: isVisible(snapshot.rightControls),
        rightControlsRectReady: hasUsableLayout(snapshot.rightControls),
        progressBar: describeElement(snapshot.progressBar),
        progressBarVisible: isVisible(snapshot.progressBar),
        progressBarRectReady: hasUsableLayout(snapshot.progressBar),
        video: describeVideo(snapshot.video),
        videoReady: hasUsableVideo(snapshot.video),
    };
}

export function isPlayerUiReady(snapshot = capturePlayerUiReadySnapshot()): boolean {
    return Boolean(
        !snapshot.hidden &&
        snapshot.pageLoaded &&
        snapshot.video?.isConnected &&
        hasUsableVideo(snapshot.video) &&
        hasUsableLayout(snapshot.leftControls) &&
        hasUsableLayout(snapshot.rightControls) &&
        hasUsableLayout(snapshot.progressBar)
    );
}

let lifecycle: PlayerUiLifecycle | null = null;

export function registerPlayerUiLifecycle(): void {
    if (lifecycle) return;
    const app = getContentApp();
    const sizeTargets = new Set<Element>();
    const sizeObserver = typeof ResizeObserver === "undefined" ? null :
        new ResizeObserver(() => controller.requestCheck());
    const controller = new PlayerUiLifecycle({
        capture: () => {
            const snapshot = capturePlayerUiReadySnapshot();
            if (sizeObserver) {
                const targets = new Set<Element>([
                    snapshot.video, snapshot.leftControls, snapshot.rightControls, snapshot.progressBar,
                ].filter((element) => element?.isConnected));
                for (const element of sizeTargets) {
                    if (!targets.has(element)) {
                        sizeObserver.unobserve(element);
                        sizeTargets.delete(element);
                    }
                }
                for (const element of targets) {
                    if (!sizeTargets.has(element)) {
                        sizeTargets.add(element);
                        // Hover rules, stylesheets and ancestor layout can change
                        // geometry without mutating the native hosts themselves.
                        sizeObserver.observe(element, { box: "border-box" });
                    }
                }
            }
            return snapshot;
        },
        isReady: isPlayerUiReady,
        duration: getPlayerTimelineDuration,
        ready: (snapshot) => {
            logUiLifecycle("playerUI", "ready", { target: "ready", ...summarizePlayerUiSnapshot(snapshot) });
            app.bus.emit(CONTENT_EVENTS.PLAYER_UI_READY, { snapshot }, { source: "playerUiLifecycle" });
        },
        invalidated: () => app.bus.emit(CONTENT_EVENTS.PLAYER_UI_INVALIDATED, {}, { source: "playerUiLifecycle" }),
        timelineChanged: (video, duration) => app.bus.emit(CONTENT_EVENTS.PLAYER_TIMELINE_CHANGED, { video, duration }, { source: "playerUiLifecycle" }),
    });
    lifecycle = controller;
    const off = [
        app.bus.on(CONTENT_EVENTS.APP_PAGE_READY, controller.requestCheck),
        app.bus.on(CONTENT_EVENTS.VIDEO_ELEMENT_CHANGED, controller.requestCheck),
        app.bus.on(CONTENT_EVENTS.VIDEO_ID_CHANGED, () => controller.refresh()),
        app.bus.on(CONTENT_EVENTS.PLAYER_VIDEO_READY, controller.requestCheck),
        app.bus.on(CONTENT_EVENTS.PLAYER_DURATION_CHANGED, controller.requestCheck),
    ];
    const hostSelector = ".bpx-player-ctrl-time, .bpx-player-container, .bpx-player-control-bottom-left, .bpx-player-control-bottom-right, .bpx-player-progress, .bpx-player-shadow-progress-area, .bpx-player-ctrl-time-duration, video";
    const uiSelector = "#previewbar, #shadowPreviewbar, #bsbPlayerButtonContainer, .skipButtonControlBarContainer";
    const contains = (node: Node, selector: string) => node instanceof Element &&
        (node.matches(selector) || !!node.querySelector(selector));
    const observer = new MutationObserver((records) => {
        // Ignore danmaku, native elapsed-time ticks and our own segment rendering.
        // Only host structure/layout and the native total-duration label matter.
        const relevant = records.filter((record) => {
            const target = record.target instanceof Element ? record.target : record.target.parentElement;
            return target?.matches(hostSelector) || !!target?.closest(".bpx-player-ctrl-time-duration") ||
                Array.from(record.addedNodes).some((node) => contains(node, hostSelector)) ||
                Array.from(record.removedNodes).some((node) => contains(node, `${hostSelector}, ${uiSelector}`));
        });
        if (!relevant.length) return;
        // React/Vue or the player may rewrite a host's children without replacing
        // the host. Restore our roots once; our own insertions do not trigger refresh.
        const removedUi = relevant.some((record) => Array.from(record.removedNodes).some((node) => contains(node, uiSelector)));
        if (removedUi) controller.refresh(); else controller.requestCheck();
    });
    observer.observe(document.documentElement, {
        childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ["class", "style", "data-screen"],
    });
    document.addEventListener("visibilitychange", controller.requestCheck);
    window.addEventListener("resize", controller.requestCheck);
    controller.requestCheck();
    addCleanupListener(() => {
        observer.disconnect();
        sizeObserver?.disconnect();
        sizeTargets.clear();
        off.forEach((unsubscribe) => unsubscribe());
        document.removeEventListener("visibilitychange", controller.requestCheck);
        window.removeEventListener("resize", controller.requestCheck);
        controller.dispose();
        lifecycle = null;
    });
}

export function waitForPlayerUiReady(timeout?: number): Promise<PlayerUIReadySnapshot> {
    registerPlayerUiLifecycle();
    return lifecycle.wait(timeout);
}
