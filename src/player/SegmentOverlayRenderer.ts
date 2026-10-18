import Config from "../config";
import { ActionType, Category, SponsorSourceType } from "../types";
import type { TimelineTarget } from "./TimelineAdapter";

export interface TimelineSegment {
    segment: [number, number];
    category: Category;
    actionType: ActionType;
    unsubmitted: boolean;
    showLarger: boolean;
    source: SponsorSourceType;
    selectedSegment?: boolean;
}

export function clipTimelineSegments(segments: TimelineSegment[], duration: number): TimelineSegment[] {
    if (!Number.isFinite(duration) || duration <= 0) return [];
    return (segments ?? []).flatMap(item => {
        const [start, end] = item.segment;
        if (!Number.isFinite(start)) return [];
        if (end === undefined || end === start) return start >= 0 && start <= duration ? [item] : [];
        if (!Number.isFinite(end) || end < start) return [];
        const clipped: [number, number] = [Math.max(0, start), Math.min(duration, end)];
        return clipped[1] > clipped[0] ? [{ ...item, segment: clipped }] : [];
    }).sort((a, b) => (b.segment[1] - b.segment[0]) - (a.segment[1] - a.segment[0]));
}

/** Decorative overlays only; native pointer/seek handling stays with the player. */
export class SegmentOverlayRenderer {
    private views = new Map<HTMLElement, HTMLUListElement>();
    private segments: TimelineSegment[] = [];
    private duration = 0;

    sync(targets: TimelineTarget[]): void {
        const hosts = new Set(targets.map(target => target.host));
        for (const [host, layer] of this.views) {
            if (!hosts.has(host)) { layer.remove(); this.views.delete(host); }
        }
        for (const target of targets) {
            let layer = this.views.get(target.host);
            if (!layer) {
                layer = target.host.ownerDocument.createElement("ul");
                layer.className = "sbSegmentOverlay";
                layer.id = target.id;
                layer.setAttribute("aria-hidden", "true");
                this.views.set(target.host, layer);
                this.draw(layer);
            }
            if (layer.parentElement !== target.host) target.host[target.placement](layer);
        }
    }

    render(segments: TimelineSegment[], duration: number): void {
        this.segments = segments;
        this.duration = duration;
        this.views.forEach(layer => this.draw(layer));
    }

    private draw(layer: HTMLUListElement): void {
        layer.replaceChildren(...this.segments.map(segment => {
            const bar = layer.ownerDocument.createElement("li");
            bar.className = "previewbar";
            bar.classList.toggle("selectedSegment", !!segment.selectedSegment);
            bar.textContent = segment.showLarger ? "\u00a0\u00a0" : "\u00a0";
            const category = (segment.unsubmitted ? "preview-" : "") + segment.category;
            const style = Config.config.barTypes[category];
            bar.setAttribute("sponsorblock-category", category);
            // Local variables work even if the destination did not copy the page's palette.
            if (style?.color) bar.style.setProperty(`--sb-category-${category}`, style.color);
            bar.style.backgroundColor = `var(--sb-category-${category})`;
            bar.style.opacity = style?.opacity;
            bar.style.position = "absolute";
            const [start, end] = segment.segment;
            bar.style.left = `${start / this.duration * 100}%`;
            if (end > start) bar.style.right = `${(1 - end / this.duration) * 100}%`;
            return bar;
        }));
    }

    remove(): void {
        this.views.forEach(layer => layer.remove());
        this.views.clear();
        this.segments = [];
    }
}
