import { versionHigher } from "../versionHigher";
import { version } from "../version.json";
import { resetLastArtworkSrc } from "./mediaSession";

function windowMessageListener(message: MessageEvent) {
    if (message.data?.source && message.data?.source === "sb-reset-media-session-link") {
        resetLastArtworkSrc();
    }
}

// TODO: rewrite with bilibili api.
export function init(): void {
    // Should it teardown an old copy of the script, to replace it if it is a newer version (two extensions installed at once)
    const shouldTearDown =
        document.querySelector("#sponsorblock-document-script")?.getAttribute?.("teardown") === "true";
    const versionBetter = window["versionCB"] && (!window["versionCB"] || versionHigher(version, window["versionCB"]));
    if (shouldTearDown || versionBetter) {
        window["teardownCB"]?.();
    } else if (window["versionCB"] && !versionHigher(version, window["versionCB"])) {
        // Leave the other script be then
        return;
    }

    window["versionCB"] = version;
    window["teardownCB"] = teardown;

    // For compatibility with older versions of the document script;
    const fakeDocScript = document.createElement("div");
    fakeDocScript.id = "sponsorblock-document-script";
    fakeDocScript.setAttribute("version", version);
    const head = document.head || document.documentElement;
    head.appendChild(fakeDocScript);

    window.addEventListener("message", windowMessageListener);
}

function teardown() {
    window.removeEventListener("message", windowMessageListener);
    window["teardownCB"] = null;
}
