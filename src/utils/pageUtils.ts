export function getControls(): HTMLElement {
    const controlsSelectors = [
        // Bilibili
        ".bpx-player-control-bottom-right"
    ];

    for (const controlsSelector of controlsSelectors) {
        const controls = Array.from(document.querySelectorAll(controlsSelector)).filter(el => !isInPreviewPlayer(el));

        if (controls.length > 0) {
            return <HTMLElement> controls[controls.length - 1];
        }
    }

    return null;
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
        const params: Record<string, unknown> = windowHash.split('&').reduce((acc, param) => {
            const [key, value] = param.split('=');
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