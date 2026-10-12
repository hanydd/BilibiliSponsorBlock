export function getPlayerContainer(): HTMLElement | null {
    const video = Array.from(document.querySelectorAll<HTMLVideoElement>(
        "#bilibili-player video:not(.bpx-player-seamless-replacement)"
    )).find((element) => !isInPreviewPlayer(element));
    return video?.closest<HTMLElement>(".bpx-player-container") ?? null;
}

function getPlayerControls(selector: string): HTMLElement {
    const root = getPlayerContainer();
    if (!root) return null;
    const controls = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
        (element) => !isInPreviewPlayer(element)
    );

    return controls[controls.length - 1] ?? null;
}

export function getControls(): HTMLElement {
    return getPlayerControls(".bpx-player-control-bottom-right");
}

export function getLeftControls(): HTMLElement {
    return getPlayerControls(".bpx-player-control-bottom-left");
}

export function getProgressBar(): HTMLElement {
    const root = getPlayerContainer();
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
