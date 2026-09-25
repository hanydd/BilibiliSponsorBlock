import { getContentApp } from "./app";
import { CONTENT_EVENTS } from "./app/events";

let popup: HTMLDivElement = null;
let observer: MutationObserver = null;
let initialised = false;

export function registerPopupManager(): void {
    const app = getContentApp();
    app.commands.register("popup/openInfoMenu", openInfoMenu);
    app.commands.register("popup/closeInfoMenu", (options) => {
        if (!options || !options.onlyOverlay || popup?.classList.contains("sb-popup-wide")) closeInfoMenu();
    });
    app.bus.on(CONTENT_EVENTS.VIDEO_RESET_REQUESTED, closeInfoMenu);
}

export function handlePopupInfoRequest(updating: boolean): void {
    // A new popup's initial request closes an already-initialised embedded popup.
    if (!updating && initialised && popup?.isConnected) closeInfoMenu();
    initialised = true;
}

function openInfoMenu(): void {
    if (popup) return;
    initialised = false;
    popup = document.createElement("div");
    popup.id = "sponsorBlockPopupContainer";

    const frame = document.createElement("iframe");
    frame.width = "374";
    frame.height = "500";
    frame.style.borderRadius = "6px";
    frame.style.margin = "0px auto 20px";
    frame.addEventListener("load", () => {
        frame.contentWindow.postMessage("", "*");
        const stylusStyle = document.querySelector(".stylus");
        if (stylusStyle) {
            frame.contentWindow.postMessage({ type: "style", css: stylusStyle.textContent }, "*");
        }
    });
    frame.src = chrome.runtime.getURL("popup.html");
    popup.appendChild(frame);
    updateHost();
    // Observe outside the player so replacing the host does not stop recovery.
    observer = new MutationObserver(updateHost);
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-screen"],
    });
}

function updateHost(): void {
    const player = document.querySelector(".bpx-player-container");
    const wide = player?.getAttribute("data-screen") === "wide";
    const host = wide
        ? player.querySelector<HTMLElement>(".bpx-player-video-area")
        : document.querySelector<HTMLElement>("#danmukuBox");
    if (!host) return;

    popup.classList.toggle("sb-popup-wide", wide);
    if (popup.parentElement === host) return;

    // Preserve iframe state where supported; detached hosts require a reload.
    const movableHost = host as HTMLElement & { moveBefore?: (node: Node, child: Node | null) => void };
    if (popup.isConnected && movableHost.moveBefore) {
        movableHost.moveBefore(popup, host.firstChild);
    } else {
        initialised = false;
        host.prepend(popup);
    }
}

function closeInfoMenu(): void {
    if (!popup) return;
    observer?.disconnect();
    observer = null;
    popup.remove();
    popup = null;
    initialised = false;
    window.dispatchEvent(new Event("closePopupMenu"));
    getContentApp().bus.emit(CONTENT_EVENTS.UI_POPUP_CLOSED, {}, { source: "popupManager.closeInfoMenu" });
}
