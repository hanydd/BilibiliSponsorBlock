import { getLinkAttribute, getThumbnailSelectors } from "./thumbnail-selectors";
import { labelThumbnail } from "./thumbnails";

/** Watch cards cheaply; only resolve IDs, request labels and touch their DOM while visible. */
export class ThumbnailObserver {
    private readonly cards = new Set<HTMLElement>();
    private readonly visibleCards = new Set<HTMLElement>();
    private readonly dirtyCards = new Set<HTMLElement>();
    private readonly visibilityObserver: IntersectionObserver;
    private readonly mutationObserver: MutationObserver;
    private readonly selector: string;

    constructor(
        readonly container: Element,
        private readonly containerType: string,
        onContainerRemoved: () => void
    ) {
        this.selector = getThumbnailSelectors(containerType);
        // The viewport root also respects clipping by nested playlist scroll containers.
        this.visibilityObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const card = entry.target as HTMLElement;
                if (!this.cards.has(card)) continue;
                if (entry.isIntersecting && entry.boundingClientRect.width > 0 && entry.boundingClientRect.height > 0) {
                    this.visibleCards.add(card);
                    this.labelVisibleCard(card);
                } else {
                    this.visibleCards.delete(card);
                }
            }
        });

        this.mutationObserver = new MutationObserver((mutations) => {
            if (!container.isConnected) {
                this.disconnect();
                onContainerRemoved();
                return;
            }

            const changedCards = new Set<HTMLElement>();
            let nodesRemoved = false;
            for (const mutation of mutations) {
                const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
                // Our label text/icon updates must not trigger another pass over the playlist.
                if (target?.closest(".sponsorThumbnailLabel")) continue;
                if (mutation.type === "childList") {
                    nodesRemoved ||= mutation.removedNodes.length > 0;
                    if (!mutation.removedNodes.length && [...mutation.addedNodes].every(
                        (node) => node instanceof Element && node.matches(".sponsorThumbnailLabel")
                    )) continue;

                    for (const node of mutation.addedNodes) {
                        if (node instanceof HTMLElement) this.observeCards(node);
                    }
                }

                const card = target?.closest<HTMLElement>(this.selector);
                if (card && this.cards.has(card)) changedCards.add(card);
            }

            if (nodesRemoved) this.removeDetachedCards();
            for (const card of changedCards) {
                this.dirtyCards.add(card);
                this.labelVisibleCard(card);
            }
        });
        this.mutationObserver.observe(container, {
            attributes: true,
            attributeFilter: [getLinkAttribute(containerType)],
            childList: true,
            subtree: true,
        });
        if (container.parentNode) this.mutationObserver.observe(container.parentNode, { childList: true });
        this.observeCards(container);
    }

    refresh(invalidateLabels = false): void {
        this.removeDetachedCards();
        this.observeCards(this.container);
        if (invalidateLabels) {
            for (const card of this.cards) this.dirtyCards.add(card);
        }
        for (const card of this.visibleCards) this.labelVisibleCard(card);
    }

    disconnect(): void {
        this.mutationObserver.disconnect();
        this.visibilityObserver.disconnect();
        this.cards.clear();
        this.visibleCards.clear();
        this.dirtyCards.clear();
    }

    private observeCards(root: Element): void {
        if (!this.container.contains(root)) return;
        if (root.matches(this.selector)) this.observeCard(root as HTMLElement);
        for (const card of root.querySelectorAll<HTMLElement>(this.selector)) this.observeCard(card);
    }

    private observeCard(card: HTMLElement): void {
        if (this.cards.has(card)) return;
        this.cards.add(card);
        this.dirtyCards.add(card);
        this.visibilityObserver.observe(card);
    }

    private removeDetachedCards(): void {
        for (const card of this.cards) {
            if (!this.container.contains(card)) {
                this.visibilityObserver.unobserve(card);
                this.cards.delete(card);
                this.visibleCards.delete(card);
                this.dirtyCards.delete(card);
            }
        }
    }

    private labelVisibleCard(card: HTMLElement): void {
        if (this.dirtyCards.has(card) && this.visibleCards.has(card) && card.isConnected && this.container.contains(card)) {
            // Leaving the viewport retains the label, including a cached "no label" result.
            // Only card mutations or an explicit settings refresh make it dirty again.
            this.dirtyCards.delete(card);
            void labelThumbnail(card, this.containerType).catch(() => {
                if (this.cards.has(card)) this.dirtyCards.add(card);
            });
        }
    }
}
