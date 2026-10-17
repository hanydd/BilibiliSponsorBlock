import { getPlayerTimelineDuration, resolveTimelineDuration } from "../utils/playerDuration";

export interface TimelineTooltip {
    seekBar: HTMLElement;
    container: HTMLElement;
    anchor: Element;
    className: string;
}

export interface TimelineTarget {
    id: string;
    host: HTMLElement;
    placement: "prepend" | "append";
    tooltip?: TimelineTooltip;
}

export interface TimelineSnapshot {
    duration: number;
    targets: TimelineTarget[];
}

/** One surface can expose several native tracks sharing the same time axis. */
export interface TimelineAdapter {
    read(video: HTMLVideoElement): TimelineSnapshot;
    observe(changed: () => void): () => void;
}

abstract class DomTimelineAdapter implements TimelineAdapter {
    protected abstract hosts: string;
    protected abstract labels: string;
    constructor(protected doc: Document) {}
    abstract read(video: HTMLVideoElement): TimelineSnapshot;

    observe(changed: () => void): () => void {
        const selector = `${this.hosts}, ${this.labels}, video`;
        const contains = (node: Node, query: string) => node.nodeType === 1 &&
            ((node as Element).matches(query) || !!(node as Element).querySelector(query));
        const observer = new MutationObserver(records => {
            const relevant = records.some(record => {
                const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
                if (record.type === "attributes") return target?.tagName === "VIDEO";
                return !!target?.closest(this.labels) ||
                    [...record.addedNodes].some(node => contains(node, selector)) ||
                    [...record.removedNodes].some(node => contains(node, `${selector}, .sbSegmentOverlay, .sponsorCategoryTooltip`));
            });
            if (relevant) changed();
        });
        observer.observe(this.doc.documentElement, {
            childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"],
        });
        // Media properties can change without a text/DOM mutation, even with controls hidden.
        this.doc.addEventListener("loadedmetadata", changed, true);
        this.doc.addEventListener("durationchange", changed, true);
        return () => {
            observer.disconnect();
            this.doc.removeEventListener("loadedmetadata", changed, true);
            this.doc.removeEventListener("durationchange", changed, true);
        };
    }

    protected target(root: ParentNode, selector: string, id: string, placement: TimelineTarget["placement"]): TimelineTarget | null {
        const host = Array.from(root.querySelectorAll<HTMLElement>(selector))
            .find(element => !element.closest(".v-recommend-inline-player"));
        return host ? { id, host, placement } : null;
    }
}

export class PageTimelineAdapter extends DomTimelineAdapter {
    protected hosts = ".bpx-player-progress, .bpx-player-shadow-progress-area, .bpx-player-mini-progress, .bpx-player-progress-popup, .bpx-player-progress-preview, .bpx-player-progress-hotspot";
    protected labels = ".bpx-player-ctrl-time-duration";

    read(video: HTMLVideoElement): TimelineSnapshot {
        const player = video?.ownerDocument === this.doc && video.closest(".bpx-player-container");
        if (!player) return { duration: 0, targets: [] };
        const main = this.target(player, ".bpx-player-progress", "previewbar", "prepend");
        const seekBar = player.querySelector<HTMLElement>(".bpx-player-progress-wrap");
        const container = player.querySelector<HTMLElement>(".bpx-player-progress-popup");
        const anchor = container?.querySelector(".bpx-player-progress-hotspot") ?? container?.querySelector(".bpx-player-progress-preview");
        if (main && seekBar && container && anchor) {
            main.tooltip = { seekBar, container, anchor, className: "bpx-player-progress-preview-time" };
        }
        return { duration: getPlayerTimelineDuration(video), targets: [
            main,
            this.target(player, ".bpx-player-shadow-progress-area", "shadowPreviewbar", "prepend"),
            this.target(player, ".bpx-player-mini-progress", "miniPreviewbar", "append"),
        ].filter((target): target is TimelineTarget => !!target) };
    }
}

export class DocumentPipTimelineAdapter extends DomTimelineAdapter {
    protected hosts = ".bpx-player-rich-pip-progress, .bpx-player-rich-pip-audio-progress";
    protected labels = ".bpx-player-rich-pip-time-label, .bpx-player-rich-pip-audio-duration";

    read(video: HTMLVideoElement): TimelineSnapshot {
        const root = video?.ownerDocument === this.doc && video.closest(".bpx-player-rich-pip-root");
        if (!root) return { duration: 0, targets: [] };
        const label = root.querySelector(".bpx-player-rich-pip-time-label")?.textContent?.split("/").pop()?.trim() ||
            root.querySelector(".bpx-player-rich-pip-audio-duration")?.textContent?.trim();
        return { duration: resolveTimelineDuration(video, label), targets: [
            this.target(root, ".bpx-player-rich-pip-progress", "pipPreviewbar", "append"),
            this.target(root, ".bpx-player-rich-pip-audio-progress", "pipAudioPreviewbar", "append"),
        ].filter((target): target is TimelineTarget => !!target) };
    }
}
