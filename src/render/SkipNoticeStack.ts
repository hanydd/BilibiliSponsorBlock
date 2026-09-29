import { occupiedViewport, stackOffsets, stackMotion } from "../notices/StackLayout";
import { addCleanupListener } from "../utils/cleanup";

/** B1: bottom-to-top cards, downward details and an inline overflow stack. */
export interface StackCard {
    element: HTMLElement;
    expanded: boolean;
    animateArrival: boolean;
    setPaused: (paused: boolean) => void;
    close: () => void;
}

interface Entry extends StackCard {
    defaultExpanded: boolean;
    header: HTMLElement;
    detail: HTMLElement;
    gap: number;
    offset: number;
    visible: boolean;
    positioned: boolean;
    shown: boolean;
    closing: boolean;
    finishClose?: () => void;
}

const stacks = new WeakMap<HTMLElement, SkipNoticeStack>();
const memberships = new WeakMap<HTMLElement, { stack: SkipNoticeStack; entry: Entry }>();
const GAP = 6;
const activeStacks = new Set<SkipNoticeStack>();
addCleanupListener(() => [...activeStacks].forEach((stack) => stack.destroy()));

export function registerStackCard(card: StackCard): () => void {
    const wrapper = card.element.parentElement;
    const player = wrapper.parentElement;
    let stack = stacks.get(player);
    if (!stack) {
        stack = new SkipNoticeStack(player);
        stacks.set(player, stack);
    }
    return stack.add(card, wrapper);
}

export function expandStackCard(element: HTMLElement): void {
    const member = memberships.get(element);
    if (member) member.stack.expand(member.entry);
}

export function setStackCardExpanded(element: HTMLElement, expanded: boolean): void {
    const member = element && memberships.get(element);
    if (member) member.stack.setExpanded(member.entry, expanded);
}

/** Logical removal stays synchronous; only the visual unmount is delayed. */
export function dismissStackCard(wrapper: HTMLElement, dispose: () => void): void {
    const element = wrapper.querySelector<HTMLElement>(".sponsorSkipStackCard");
    const member = element && memberships.get(element);
    if (member) member.stack.dismiss(member.entry, dispose);
    else dispose();
}

class SkipNoticeStack {
    private host = document.createElement("div");
    private body = document.createElement("div");
    private entries: Entry[] = []; // Bottom to top; appending never moves an existing header.
    private observer: ResizeObserver;
    private screenObserver: MutationObserver;
    private timers = new Set<ReturnType<typeof setTimeout>>();
    private collapseTimer: ReturnType<typeof setTimeout>;
    private leaveTimer: ReturnType<typeof setTimeout>;
    private pointer?: Entry;
    private stateAnchor?: Entry;
    private focus?: Entry;
    private reviewing = false;
    private busy = 0;
    private suppressHover = false;
    private pressed = false;
    private windowFocused = document.hasFocus();
    private available = 0;
    // Virtual geometry keeps the existing anchoring rules. Only the occupied
    // portion gets a DOM box, so the video outside the cards remains uncovered.
    private previousHeight = 0;
    private topInset = 0;
    private bottomInset = 0;
    private bottomReserve = 0;
    private visibleLimit = Infinity;
    private disposed = false;

    constructor(private player: HTMLElement) {
        this.host.className = "sponsorSkipStack";
        for (const [name, duration] of Object.entries(stackMotion)) this.host.style.setProperty(`--sb-${name}-duration`, `${duration}ms`);
        this.body.className = "sponsorSkipStackBody";
        this.host.append(this.body);
        player.prepend(this.host);
        activeStacks.add(this);
        this.host.addEventListener("pointermove", this.move);
        this.host.addEventListener("pointerleave", this.leave);
        this.host.addEventListener("pointerdown", this.down);
        this.host.addEventListener("transitionend", (event) => {
            if ((event.target as Element).matches(".sponsorSkipStackCard, .sponsorSkipStackDetail")) this.layout();
        });
        // Wheel scrolling changes which card is under a stationary pointer. Wait for a
        // fresh pointer movement before using that pointer to choose auto-collapse targets.
        this.host.addEventListener("wheel", () => this.cancel(this.collapseTimer), { passive: true });
        this.host.addEventListener("focusin", this.focusIn);
        this.host.addEventListener("focusout", this.focusOut);
        this.host.addEventListener("pointerover", (event) => {
            if ((event.target as Element).closest(".sponsorSkipStackCount") && !this.suppressHover) this.review();
        });
        this.host.addEventListener("click", (event) => {
            if ((event.target as Element).closest(".sponsorSkipStackCount")) this.review(event.detail === 0);
        });
        document.addEventListener("pointerup", this.up);
        window.addEventListener("blur", this.blur);
        window.addEventListener("focus", this.windowFocus);
        this.observer = new ResizeObserver((changes) => {
            if (changes.some((change) => change.target === player)) this.cancel(this.collapseTimer);
            this.layout();
        });
        this.observer.observe(player);
        this.screenObserver = new MutationObserver(() => this.layout());
        this.screenObserver.observe(player.closest(".bpx-player-container") || player, {
            attributes: true, attributeFilter: ["data-screen"],
        });
    }

    private later(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout> {
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            if (!this.disposed) callback();
        }, milliseconds);
        this.timers.add(timer);
        return timer;
    }

    private cancel(timer: ReturnType<typeof setTimeout>): void {
        clearTimeout(timer);
        this.timers.delete(timer);
    }

    private duration(milliseconds: number): number {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : milliseconds;
    }

    add(card: StackCard, wrapper: HTMLElement): () => void {
        const entry: Entry = {
            ...card,
            defaultExpanded: card.expanded,
            header: card.element.querySelector(".sponsorSkipStackHeader"),
            detail: card.element.querySelector(".sponsorSkipStackDetailInner"),
            gap: 0, offset: 0, visible: false, positioned: false, shown: false, closing: false,
        };
        // Incoming notices wait above the current working set during interaction.
        if (this.pointer || this.focus || this.busy) {
            this.visibleLimit = Math.min(this.visibleLimit, this.entries.filter((item) => item.visible).length);
        }
        this.entries.push(entry);
        memberships.set(card.element, { stack: this, entry });
        this.body.append(wrapper);
        this.observer.observe(entry.header);
        this.observer.observe(entry.detail);
        this.layout();
        return () => {
            if (!memberships.has(card.element)) return;
            memberships.delete(card.element);
            this.observer.unobserve(entry.header);
            this.observer.unobserve(entry.detail);
            this.entries = this.entries.filter((item) => item !== entry);
            if (this.pointer === entry) this.pointer = undefined;
            if (this.stateAnchor === entry) this.stateAnchor = undefined;
            if (this.focus === entry) this.focus = undefined;
            if (!this.entries.length) this.destroy();
            else this.layout();
        };
    }

    private lookup(target: EventTarget): Entry | undefined {
        return target ? this.entries.find((entry) => !entry.closing && entry.element.contains(target as Node)) : undefined;
    }

    private move = (event: PointerEvent): void => {
        if (this.busy || this.pressed) return;
        this.suppressHover = false;
        this.cancel(this.leaveTimer);
        const entry = this.lookup(event.target);
        if (!entry) return;
        if (!entry.visible) {
            this.review();
            return;
        }
        if (this.pointer !== entry) {
            this.stateAnchor = undefined;
            this.freeze();
            this.pointer = entry;
            this.expand(entry);
        }
        this.armCollapse();
    };

    private leave = (): void => {
        this.cancel(this.collapseTimer);
        this.pointer = undefined;
        if (this.focus || this.busy || this.pressed) return;
        // A small bridge delay allows crossing the 6px gaps without collapsing.
        this.leaveTimer = this.later(() => {
            if (this.pointer || this.focus || this.busy) return;
            this.reviewing = false;
            this.stateAnchor = undefined;
            // A shrinking container can emit pointerleave without mouse movement.
            // Keep the settled origin until move() observes a new interaction.
            this.visibleLimit = Infinity;
            this.entries.forEach((entry) => {
                entry.expanded = entry.defaultExpanded;
                entry.gap = entry.expanded ? this.detailHeight(entry) : 0;
            });
            this.layout();
        }, 180);
    };

    private down = (): void => {
        this.pressed = true;
        this.cancel(this.collapseTimer);
        this.freeze();
    };

    private up = (): void => {
        this.pressed = false;
        if (!this.pointer && !this.focus) this.leave();
        else this.armCollapse();
    };

    private blur = (): void => {
        this.cancel(this.collapseTimer);
        this.pressed = false;
        this.windowFocused = false;
        this.entries.forEach((entry) => this.updateTimer(entry));
    };

    private windowFocus = (): void => {
        this.windowFocused = true;
        this.entries.forEach((entry) => this.updateTimer(entry));
    };

    private updateTimer(entry: Entry): void {
        entry.setPaused(!this.windowFocused || !entry.visible || !!this.pointer || !!this.focus || !!this.busy || this.reviewing);
    }


    private focusIn = (event: FocusEvent): void => {
        if (this.pressed) return; // Pointer focus follows hover; keyboard focus pins details.
        const entry = this.lookup(event.target);
        if (!entry) return;
        this.freeze();
        this.focus = entry;
        if (!entry.visible) this.review();
        this.expand(entry);
        this.armCollapse();
    };

    private focusOut = (event: FocusEvent): void => {
        this.focus = this.pressed ? undefined : this.lookup(event.relatedTarget);
        if (!this.focus && !this.pointer) this.leave();
        else this.armCollapse();
    };

    setExpanded(entry: Entry, expanded: boolean): void {
        entry.defaultExpanded = expanded;
        // A skip/undo updates this card in place, even if its first entrance is still running.
        entry.element.classList.remove("sponsorSkipStackArriving");
        if (!this.pointer && !this.focus && entry.visible) this.stateAnchor = entry;
        // A successful click must not collapse the controls under the pointer/focus.
        this.freeze();
        entry.expanded = expanded || entry === this.pointer || entry === this.focus;
        entry.gap = entry.expanded ? this.detailHeight(entry) : 0;
        this.layout();
    }

    expand(entry: Entry): void {
        if (entry.closing || this.busy || this.suppressHover) return;
        const index = this.entries.indexOf(entry);
        const protectedIndices = [this.pointer, this.focus].filter(Boolean).map((item) => this.entries.indexOf(item));
        if (protectedIndices.some((protectedIndex) => protectedIndex < index) && entry.gap < this.detailHeight(entry)) {
            // Downward expansion moves lower cards, so respect a separate target below this one.
            this.layout();
            return;
        }
        entry.expanded = true;
        entry.gap = this.detailHeight(entry);
        this.layout();
    }

    private armCollapse(): void {
        this.cancel(this.collapseTimer);
        if (this.reviewing || this.busy || this.pressed || (!this.pointer && !this.focus)) return;
        this.collapseTimer = this.later(() => {
            const protectedIndex = Math.max(this.entries.indexOf(this.pointer), this.entries.indexOf(this.focus));
            if (protectedIndex < 0 || this.reviewing || this.busy || this.pressed || !document.hasFocus()) return;
            this.visibleLimit = this.entries.filter((entry) => entry.visible).length;
            // Only gaps ABOVE the highest protected card may shrink. Lower gaps support its position.
            this.entries.forEach((entry, index) => {
                if (index > protectedIndex && !entry.defaultExpanded) { entry.expanded = false; entry.gap = 0; }
            });
            this.layout();
        }, 800);
    }

    private detailHeight(entry: Entry): number {
        // The bottom card uses the one shared reserve; long editors scroll inside it.
        const room = entry === this.entries[0] ? this.bottomReserve : this.available - entry.header.offsetHeight;
        return Math.min(entry.detail.getBoundingClientRect().height, Math.max(0, room));
    }

    /** Hold the actual gaps below cards when a pointer interrupts a transition. */
    private freeze(): void {
        const visible = this.entries.filter((entry) => entry.visible && !entry.closing);
        const offsets = visible.map((entry) => -new DOMMatrixReadOnly(getComputedStyle(entry.element).transform).m42 + this.bottomInset);
        visible.forEach((entry, index) => {
            if (index > 0) {
                const gap = Math.max(0, offsets[index] - offsets[index - 1] - visible[index - 1].header.offsetHeight - GAP);
                if (Math.abs(gap - entry.gap) > 0.01) entry.expanded = false;
                entry.gap = gap;
            }
            entry.element.style.transition = "none";
            entry.element.style.transform = `translateY(${this.bottomInset - offsets[index]}px)`;
            entry.offset = offsets[index];
        });
        void this.body.offsetHeight;
        visible.forEach((entry) => entry.element.style.removeProperty("transition"));
    }

    private review(focusFirst = false): void {
        if (this.reviewing || this.busy) return;
        this.freeze();
        this.reviewing = true;
        this.cancel(this.collapseTimer);
        const firstHidden = this.entries.find((entry) => !entry.visible);
        this.layout();
        // Reveal the next real card, keeping the same card DOM and action controls.
        if (firstHidden) this.host.scrollTop = Math.max(0,
            this.previousHeight - this.topInset - firstHidden.offset - firstHidden.header.offsetHeight - 12);
        if (focusFirst) firstHidden?.header.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    }

    dismiss(entry: Entry, dispose: () => void): void {
        if (this.disposed) { dispose(); return; }
        if (entry.closing) return;
        entry.finishClose = dispose;
        this.stateAnchor = undefined;
        this.freeze();
        entry.closing = true;
        entry.setPaused(true);
        entry.element.setAttribute("inert", "");
        entry.element.classList.add("sponsorSkipStackExiting");
        this.busy++;
        this.host.classList.add("sponsorSkipStackSettling");
        this.suppressHover = true;
        this.cancel(this.collapseTimer);
        // Keep the old top boundary until survivors have moved down; then admit queued cards.
        this.visibleLimit = this.entries.filter((item) => item.visible && !item.closing).length;
        this.later(() => {
            dispose();
            this.layout();
            this.later(() => {
                this.busy--;
                if (!this.busy) {
                    this.host.classList.remove("sponsorSkipStackSettling");
                    this.visibleLimit = Infinity;
                    this.layout();
                }
            }, this.duration(stackMotion.settle));
        }, this.duration(stackMotion.exit));
    }

    private layout(): void {
        if (this.disposed) return;
        const rect = this.player.getBoundingClientRect();
        const compact = rect.width <= 480 || rect.height <= 270;
        const controls = this.player.querySelector<HTMLElement>(".bpx-player-control-wrap");
        const controlHeight = controls?.getBoundingClientRect().height || 55;
        const mini = !!this.player.closest('[data-screen="mini"]');
        const bottom = mini ? 12 : Math.min(rect.height / 2, controlHeight + 12);
        this.available = Math.max(40, rect.height - bottom - 12);
        this.host.classList.toggle("sponsorSkipStackCompact", compact);

        const first = this.entries[0];
        if (!first) return;
        const detailStyle = getComputedStyle(first.detail);
        const feedback = first.detail.querySelector<HTMLElement>("[id^='sponsorSkipNoticeSecondRow']");
        const spacing = parseFloat(detailStyle.borderSpacing.split(" ").pop()) || 0;
        // Reserve one ordinary feedback row, irrespective of the number of collapsed cards.
        // Opening an editor does not enlarge this reserve and move every header.
        const feedbackHeight = (feedback?.offsetHeight || 25) + spacing * 2 +
            parseFloat(detailStyle.paddingTop) + parseFloat(detailStyle.paddingBottom);
        this.bottomReserve = Math.min(feedbackHeight, Math.max(0, this.available - first.header.offsetHeight));

        const oldScroll = this.host.scrollTop;
        const oldOrigin = this.previousHeight - oldScroll;
        const hostTop = rect.bottom - bottom - this.available;
        const previousBottomInset = this.bottomInset;
        const anchor = !this.busy && (this.pointer || this.focus || this.stateAnchor);
        const anchorTop = anchor?.visible ? anchor.header.getBoundingClientRect().top - hostTop : undefined;
        const previousVisible = new Set(this.entries.filter((entry) => entry.visible));
        const transforms = new Map(this.entries.map((entry) => [entry,
            new DOMMatrixReadOnly(getComputedStyle(entry.element).transform).m42]));
        // Keep the animation's swept area until its transition finishes. Otherwise
        // shrinking the viewport would clip a moving card before it reaches its slot.
        const movingBounds = this.entries.filter(entry => entry.visible && entry.positioned).map(entry => {
            const card = entry.element.getBoundingClientRect();
            const detail = entry.element.querySelector(".sponsorSkipStackDetail").getBoundingClientRect();
            return { top: card.top - hostTop, bottom: Math.max(card.bottom, detail.bottom) - hostTop };
        });

        const measurements = this.entries.map(entry => {
            if (entry.expanded) entry.gap = this.detailHeight(entry);
            return { header: entry.header.offsetHeight, detailGap: entry.gap };
        });
        const offsets = stackOffsets(measurements, this.bottomReserve, GAP);
        this.entries.forEach((entry, index) => { entry.offset = offsets[index]; });
        // Moving the scroll surface and the active card together keeps its header stationary.
        // Extra downward content becomes scrollable, rather than entering the player controls.
        let origin = (this.reviewing || this.busy || this.suppressHover) ? Math.max(this.available, oldOrigin) : this.available;
        if (anchorTop !== undefined) origin = anchorTop + anchor.offset + anchor.header.offsetHeight;
        let count = 0;
        let folded = false;
        for (const entry of this.entries) {
            const protectedCard = entry === this.pointer || entry === this.focus;
            const fits = entry.offset + entry.header.offsetHeight <= origin - 20;
            entry.visible = this.reviewing || (!folded && (protectedCard || (fits && count < this.visibleLimit))) || count === 0;
            if (entry.visible) count++;
            else folded = true;
            entry.element.style.setProperty("--sb-detail-height", `${entry.expanded ? this.detailHeight(entry) : 0}px`);
            entry.element.setAttribute("aria-expanded", String(entry.expanded));
            entry.element.classList.toggle("sponsorSkipStackFolded", !entry.visible);
            entry.element.toggleAttribute("inert", entry.closing);
            entry.element.firstElementChild.toggleAttribute("inert", !entry.visible || entry.closing);
            entry.element.setAttribute("aria-hidden", String(!entry.visible));
            this.updateTimer(entry);
        }
        const hidden = this.entries.filter((entry) => !entry.visible);
        const highest = this.entries.filter((entry) => entry.visible).pop();
        const contentHeight = highest ? highest.offset + highest.header.offsetHeight + 20 : 0;
        const height = Math.max(this.available, origin, contentHeight,
            (this.reviewing || this.busy) ? this.previousHeight : 0);
        const bounds = this.entries.filter(entry => entry.visible).map(entry => ({
            top: origin - entry.offset - entry.header.offsetHeight,
            bottom: origin - entry.offset + (entry.expanded ? this.detailHeight(entry) : 0),
        }));
        if (highest && hidden.length) bounds.push({
            top: origin - highest.offset - highest.header.offsetHeight - Math.min(hidden.length, 2) * 8,
            bottom: origin - highest.offset,
        });
        const insets = occupiedViewport(this.available, [...bounds, ...movingBounds]);
        this.topInset = insets.top;
        this.bottomInset = insets.bottom;
        this.host.style.bottom = `${bottom + this.bottomInset}px`;
        this.host.style.height = `${this.available - this.topInset - this.bottomInset}px`;
        this.body.style.height = `${height - this.topInset - this.bottomInset}px`;
        this.host.classList.toggle("sponsorSkipStackReviewing", this.reviewing);
        this.host.classList.toggle("sponsorSkipStackScrollable", height > this.available);
        this.host.scrollTop = height - origin;
        const originChange = height - this.host.scrollTop - oldOrigin - (this.bottomInset - previousBottomInset);
        if (Math.abs(originChange) > 0.01) {
            // Rebase existing transforms before animating so changing the scroll surface
            // cannot cause a one-frame jump, especially when closing during review.
            previousVisible.forEach((entry) => {
                entry.element.style.transition = "none";
                entry.element.style.transform = `translateY(${transforms.get(entry) - originChange}px)`;
            });
            void this.body.offsetHeight;
            previousVisible.forEach((entry) => entry.element.style.removeProperty("transition"));
        }
        const entering = this.entries.filter((entry) => !entry.positioned ||
            (entry.visible && !previousVisible.has(entry) && !entry.shown));
        // Establish the outer slot before starting the inner downward entrance animation.
        // Otherwise its transform transitions from zero (the stack bottom) up to the slot,
        // overpowering the child's downward animation. Cards already seen simply move slots.
        entering.forEach((entry) => { entry.element.style.transition = "none"; });
        this.entries.forEach((entry) => {
            const badge = entry.element.querySelector<HTMLElement>(".sponsorSkipStackCount");
            badge.textContent = entry === highest && hidden.length ? `+${hidden.length}` : "";
            badge.hidden = !badge.textContent;
            if (entry.visible) {
                entry.element.style.visibility = "visible";
                entry.element.style.clipPath = "";
                entry.element.style.transform = `translateY(${this.bottomInset - entry.offset}px)`;
                if (!entry.shown) {
                    entry.shown = true;
                    if (entry.animateArrival) {
                        entry.element.classList.add("sponsorSkipStackArriving");
                        this.later(() => entry.element.classList.remove("sponsorSkipStackArriving"), this.duration(stackMotion.move));
                    }
                }
            } else {
                const index = hidden.indexOf(entry);
                entry.element.style.visibility = index < 2 ? "visible" : "hidden";
                entry.element.style.clipPath = "inset(0 0 calc(100% - 10px) 0)";
                const peekOffset = highest.offset + highest.header.offsetHeight + (index + 1) * 8 - entry.header.offsetHeight;
                entry.element.style.transform = `translateY(${this.bottomInset - peekOffset}px)`;
                entry.element.style.setProperty("--sb-detail-height", "0px");
            }
        });
        if (entering.length) {
            void this.body.offsetHeight;
            entering.forEach((entry) => {
                entry.positioned = true;
                entry.element.style.removeProperty("transition");
            });
        }
        this.previousHeight = height;
    }

    destroy(): void {
        if (this.disposed) return;
        this.disposed = true;
        activeStacks.delete(this);
        [...this.entries].forEach((entry) => entry.finishClose ? entry.finishClose() : entry.close());
        this.timers.forEach(clearTimeout);
        this.observer.disconnect();
        this.screenObserver.disconnect();
        document.removeEventListener("pointerup", this.up);
        window.removeEventListener("blur", this.blur);
        window.removeEventListener("focus", this.windowFocus);
        this.host.remove();
        stacks.delete(this.player);
    }
}
