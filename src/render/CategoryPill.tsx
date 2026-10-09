import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import CategoryPillComponent, { CategoryPillState } from "../components/CategoryPillComponent";
import Config from "../config";
import { getPageLoaded } from "../content/state";
import { VoteResponse } from "../messageTypes";
import { Category, SegmentUUID, SponsorTime } from "../types";
import { waitFor } from "../utils/";
import { addCleanupListener } from "../utils/cleanup";
import { logUiLifecycle } from "../utils/logger";

const id = "categoryPill";

export class CategoryPill {
    container: HTMLElement;
    ref: React.RefObject<CategoryPillComponent>;
    root: Root;

    lastState: CategoryPillState = { segment: null, show: false, open: false };

    private mutationObserver?: MutationObserver;
    private attachment?: Promise<void>;
    private pageReady = false;
    private closed = false;
    private titleNode?: HTMLElement;

    vote: (type: number, UUID: SegmentUUID, category?: Category) => Promise<VoteResponse>;

    constructor() {
        this.ref = React.createRef();
        addCleanupListener(() => this.close());
    }

    attachToPage(
        vote: (type: number, UUID: SegmentUUID, category?: Category) => Promise<VoteResponse>
    ): Promise<void> {
        this.vote = vote;
        if (this.closed) return Promise.resolve();
        if (this.pageReady) {
            this.attachToPageInternal();
            return Promise.resolve();
        }
        if (this.attachment) return this.attachment;

        this.attachment = this.waitForPage();
        return this.attachment;
    }

    private async waitForPage(): Promise<void> {
        try {
            await waitFor(() => this.closed || getPageLoaded(), 35000, 100);
            if (this.closed) return;
            this.pageReady = true;

            // SPA navigation can rewrite the title's textContent or replace the
            // entire title container. Keep one root and move it to the current title.
            this.mutationObserver = new MutationObserver(() => {
                if (this.container?.isConnected && this.container.parentElement === this.titleNode) return;
                this.attachToPageInternal();
            });
            this.mutationObserver.observe(document.body, { childList: true, subtree: true });
            this.attachToPageInternal();
        } catch (error) {
            if (!this.closed) {
                logUiLifecycle("categoryPill", "error", { action: "attach", error: String(error) });
            }
        } finally {
            this.attachment = undefined;
        }
    }

    private attachToPageInternal(): void {
        if (this.closed || !this.pageReady) return;
        const referenceNode = getBilibiliTitleNode();
        if (!referenceNode || referenceNode.contains(this.container)) return;

        if (!this.container) {
            this.container = document.createElement("span");
            this.container.id = id;
            this.root = createRoot(this.container);
            this.root.render(
                <CategoryPillComponent
                    ref={(component) => {
                        // React may commit after a route reset or a newer response.
                        // Apply the current state, never a captured segment.
                        (this.ref as React.MutableRefObject<CategoryPillComponent>).current = component;
                        if (component && !this.closed) component.setState(this.lastState);
                    }}
                    vote={this.vote}
                    showTextByDefault={true}
                    showTooltipOnClick={false}
                />
            );
        }

        this.titleNode = referenceNode;
        referenceNode.prepend(this.container);
        referenceNode.style.display = "flex";
        logUiLifecycle("categoryPill", "attach", {
            action: "mount",
            hasState: Boolean(this.lastState.segment),
            title: referenceNode,
            containerConnected: this.container.isConnected,
        });
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.mutationObserver?.disconnect();
        this.root?.unmount();
        this.container?.remove();
    }

    resetSegment(): void {
        if (this.closed) return;
        const newState = {
            segment: null,
            show: false,
            open: false,
        };

        this.ref.current?.setState(newState);
        this.lastState = newState;
    }

    async setSegment(segment: SponsorTime): Promise<void> {
        if (this.closed) return;
        logUiLifecycle("categoryPill", "state", {
            action: "setSegment",
            UUID: segment?.UUID,
            category: segment?.category,
            actionType: segment?.actionType,
            hasContainer: Boolean(this.container),
            containerConnected: this.container?.isConnected ?? false,
        });

        if (this.lastState.segment !== segment) {
            const newState = {
                segment,
                show: true,
                open: false,
            };

            this.ref.current?.setState(newState);
            this.lastState = newState;

            if (!Config.config.categoryPillUpdate) {
                Config.config.categoryPillUpdate = true;
            }
        }

        if (this.container && !this.container.isConnected) {
            logUiLifecycle("categoryPill", "detach", {
                action: "reattachNeeded",
                UUID: segment?.UUID,
            });
            this.attachToPageInternal();
        }
    }
}

function getBilibiliTitleNode(): HTMLElement {
    return document.querySelector(".video-info-container h1") as HTMLElement;
}
