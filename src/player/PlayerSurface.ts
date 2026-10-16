/** The document hosting playback can change without changing the video element. */
export interface PlayerSurface {
    readonly kind: "page" | "document-pip";
    readonly document: Document;
    readonly window: Window;
    findVideo(): HTMLVideoElement | null;
    overlayHost(video: HTMLVideoElement): HTMLElement | null;
    noticeLayout(host: Element): { compact: boolean; bottom: number };
    mountStyles(css: string): () => void;
}

interface DocumentPip extends EventTarget {
    readonly window: Window | null;
}

function documentPip(): DocumentPip | undefined {
    return (window as Window & { documentPictureInPicture?: DocumentPip }).documentPictureInPicture;
}

abstract class DomPlayerSurface implements PlayerSurface {
    abstract readonly kind: PlayerSurface["kind"];
    abstract readonly videoSelector: string;
    constructor(readonly document: Document) {}

    get window(): Window { return this.document.defaultView; }

    findVideo(): HTMLVideoElement | null {
        return Array.from(this.document.querySelectorAll<HTMLVideoElement>(this.videoSelector))
            .find(video => !video.classList.contains("bpx-player-seamless-replacement") &&
                !video.closest(".v-recommend-inline-player")) ?? null;
    }

    overlayHost(video: HTMLVideoElement): HTMLElement | null {
        return video?.closest<HTMLElement>(".bpx-player-video-area") ?? null;
    }

    noticeLayout(host: Element): { compact: boolean; bottom: number } {
        const { width, height } = host.getBoundingClientRect();
        return { compact: width <= 480 || height <= 270, bottom: this.bottomInset(host, height) };
    }

    protected abstract bottomInset(host: Element, height: number): number;
    abstract mountStyles(css: string): () => void;
}

/** Normal, wide, fullscreen and scroll-to-float players share their page document. */
class PagePlayerSurface extends DomPlayerSurface {
    readonly kind = "page";
    readonly videoSelector = "#bilibili-player video";

    protected bottomInset(host: Element, height: number): number {
        if (host.closest('[data-screen="mini"]')) return 12;
        const controls = host.querySelector(".bpx-player-control-wrap");
        return Math.min(height / 2, (controls?.getBoundingClientRect().height || 55) + 12);
    }

    // The manifest already injects the styles into the original page.
    mountStyles(): () => void { return () => undefined; }
}

/** Document PiP adopts the video area, leaving the original player controls behind. */
class DocumentPipPlayerSurface extends DomPlayerSurface {
    readonly kind = "document-pip";
    readonly videoSelector = ".bpx-player-video-area video";

    protected bottomInset(): number { return 12; }

    mountStyles(css: string): () => void {
        const style = this.document.createElement("style");
        style.dataset.sbPlayerSurface = "";
        style.textContent = css;
        const head = this.document.head;
        // Install synchronously on entry, before the site adopts any extension UI.
        // Keep it after the site's subsequent stylesheet copies and resets.
        const append = () => { if (head.lastChild !== style) head.appendChild(style); };
        append();
        const observer = new MutationObserver(append);
        observer.observe(head, { childList: true });
        return () => { observer.disconnect(); style.remove(); };
    }
}

const surfaces = new WeakMap<Document, PlayerSurface>();

export function getPlayerSurface(element: Node = document): PlayerSurface {
    const owner = element.nodeType === 9 ? element as Document : element.ownerDocument;
    let surface = surfaces.get(owner);
    if (!surface) {
        surface = owner === document ? new PagePlayerSurface(owner) : new DocumentPipPlayerSurface(owner);
        surfaces.set(owner, surface);
    }
    return surface;
}

/** Prefer the active external player; native video-only PiP keeps the page surface. */
export function getPlayerSurfaces(): PlayerSurface[] {
    const pip = documentPip()?.window;
    return pip && !pip.closed
        ? [getPlayerSurface(pip.document), getPlayerSurface()]
        : [getPlayerSurface()];
}

/** Attach document-level resources once, including PiP already open at initialization. */
export function observePlayerSurfaces(attach: (surface: PlayerSurface) => () => void): () => void {
    const mounted = new Map<Document, () => void>();
    const mount = (surface: PlayerSurface) => {
        if (mounted.has(surface.document)) return;
        const dispose = attach(surface);
        const remove = () => {
            surface.window.removeEventListener("pagehide", remove);
            mounted.delete(surface.document);
            dispose();
        };
        mounted.set(surface.document, remove);
        if (surface.kind !== "page") surface.window.addEventListener("pagehide", remove, { once: true });
    };
    const enter = (event: Event) => mount(getPlayerSurface((event as Event & { window: Window }).window.document));
    const pip = documentPip();
    pip?.addEventListener("enter", enter);
    getPlayerSurfaces().forEach(mount);
    return () => {
        pip?.removeEventListener("enter", enter);
        [...mounted.values()].forEach(remove => remove());
    };
}
