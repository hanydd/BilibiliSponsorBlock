import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import CategoryPillComponent, { CategoryPillState } from "../components/CategoryPillComponent";
import Config from "../config";
import { getPageLoaded } from "../content";
import { waitFor } from "../maze-utils";
import { addCleanupListener } from "../maze-utils/cleanup";
import { getBilibiliTitleNode } from "../maze-utils/elements";
import { VoteResponse } from "../messageTypes";
import { Category, SegmentUUID, SponsorTime } from "../types";
import { Tooltip } from "./Tooltip";

const id = "categoryPill";

export class CategoryPill {
    container: HTMLElement;
    ref: React.RefObject<CategoryPillComponent>;
    root: Root;

    lastState: CategoryPillState;

    mutationCount: number;
    isSegmentSet: boolean;
    mutationObserver?: MutationObserver;

    vote: (type: number, UUID: SegmentUUID, category?: Category) => Promise<VoteResponse>;

    constructor() {
        this.ref = React.createRef();
        this.mutationCount = 0;
        this.isSegmentSet = false;

        // this mutation observer listens to the change to title bar
        // bilibili will set the textContent of the title after loading for some reason.
        // If the node is inserted before this reset of title, it will be removed
        const mutationCounter = () => (this.mutationCount += 1);
        mutationCounter.bind(this);
        this.mutationObserver = new MutationObserver(mutationCounter);

        addCleanupListener(() => {
            if (this.mutationObserver) {
                this.mutationObserver.disconnect();
            }
        });
    }

    async attachToPage(
        vote: (type: number, UUID: SegmentUUID, category?: Category) => Promise<VoteResponse>
    ): Promise<void> {
        this.vote = vote;
        this.mutationCount = 0;
        const referenceNode = await waitFor(() => getBilibiliTitleNode());
        if (!referenceNode) {
            console.log("Title element for category pill is not found");
            return;
        }
        this.mutationObserver.disconnect();
        this.mutationObserver.observe(referenceNode, { attributes: true, childList: true });

        try {
            // wait for bilibili to finish loading
            await waitFor(getPageLoaded, 10000, 10);
            // if setSegment is called after node attachment, it won't render sometimes
            await waitFor(() => this.isSegmentSet, 10000, 100).catch(() => {
                console.log("No segment found");
            });
            this.attachToPageInternal();
        } catch (error) {
            if (error !== "TIMEOUT") console.log("Category Pill attachment error ", error);
        }
    }

    private async attachToPageInternal(): Promise<void> {
        const referenceNode = await waitFor(() => getBilibiliTitleNode());

        if (referenceNode && !referenceNode.contains(this.container)) {
            if (!this.container) {
                this.container = document.createElement("span");
                this.container.id = id;
                this.container.style.display = "relative";

                this.root = createRoot(this.container);
                this.ref = React.createRef();
                this.root.render(
                    <CategoryPillComponent
                        ref={this.ref}
                        vote={this.vote}
                        showTextByDefault={true}
                        showTooltipOnClick={false}
                    />
                );
            }

            if (this.lastState) {
                waitFor(() => this.ref.current).then(() => {
                    this.ref.current?.setState(this.lastState);
                });
            }

            referenceNode.prepend(this.container);
            referenceNode.style.display = "flex";
        }
    }

    close(): void {
        this.root.unmount();
        this.container.remove();
    }

    setVisibility(show: boolean): void {
        const newState = {
            show,
            open: show ? this.ref.current?.state.open : false,
        };

        this.ref.current?.setState(newState);
        this.lastState = newState;
    }

    async setSegment(segment: SponsorTime): Promise<void> {
        if (this.ref.current?.state?.segment !== segment) {
            const newState = {
                segment,
                show: true,
                open: false,
            };

            this.ref.current?.setState(newState);
            this.lastState = newState;

            if (!Config.config.categoryPillUpdate) {
                Config.config.categoryPillUpdate = true;

                const watchDiv = await waitFor(() => document.querySelector("#info.ytd-watch-flexy") as HTMLElement);
                if (watchDiv) {
                    new Tooltip({
                        text: chrome.i18n.getMessage("categoryPillNewFeature"),
                        link: "https://blog.ajay.app/full-video-sponsorblock",
                        referenceNode: watchDiv,
                        prependElement: watchDiv.firstChild as HTMLElement,
                        bottomOffset: "-10px",
                        opacity: 0.95,
                        timeout: 50000,
                    });
                }
            }
        }
        this.isSegmentSet = true;
    }
}
