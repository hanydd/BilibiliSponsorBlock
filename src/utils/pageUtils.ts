import { getPlayerSurfaces } from "../player/PlayerSurface";

export function getActivePlayerVideo(): HTMLVideoElement | null {
    for (const surface of getPlayerSurfaces()) {
        const video = surface.findVideo();
        if (video) return video;
    }
    return null;
}

export function getPlayerContainer(video = getActivePlayerVideo()): HTMLElement | null {
    return video?.closest<HTMLElement>(".bpx-player-container") ?? null;
}

function getPlayerControls(selector: string, root: HTMLElement | null): HTMLElement {
    if (!root) return null;
    const controls = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
        (element) => !isInPreviewPlayer(element)
    );

    return controls[controls.length - 1] ?? null;
}

export function getControls(root = getPlayerContainer()): HTMLElement {
    return getPlayerControls(".bpx-player-control-bottom-right", root);
}

export function getLeftControls(root = getPlayerContainer()): HTMLElement {
    return getPlayerControls(".bpx-player-control-bottom-left", root);
}

export function getProgressBar(root = getPlayerContainer()): HTMLElement {
    if (!root) return null;
    return Array.from(root.querySelectorAll<HTMLElement>(".bpx-player-progress-schedule"))
        .find((element) => !isInPreviewPlayer(element)) ?? null;
}

export function isInPreviewPlayer(element: Element): boolean {
    return !!element.closest(".v-recommend-inline-player");
}

export function isVisible(element: HTMLElement): boolean {
    return element && element.offsetWidth > 0 && element.offsetHeight > 0;
}

export function getHashParams(): Record<string, unknown> {
    const windowHash = window.location.hash.slice(1);
    if (windowHash) {
        const params: Record<string, unknown> = windowHash.split("&").reduce((acc, param) => {
            const [key, value] = param.split("=");
            const decoded = decodeURIComponent(value);
            try {
                acc[key] = decoded?.match(/{|\[/) ? JSON.parse(decoded) : value;
            } catch (e) {
                console.error(`Failed to parse hash parameter ${key}: ${value}`);
            }

            return acc;
        }, {});

        return params;
    }

    return {};
}

export function isPlayingPlaylist() {
    return !!document.URL.includes("&list=");
}
