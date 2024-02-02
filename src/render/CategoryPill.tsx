import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import CategoryPillComponent, { CategoryPillState } from "../components/CategoryPillComponent";
import Config from "../config";
import { VoteResponse } from "../messageTypes";
import { Category, SegmentUUID, SponsorTime } from "../types";
import { Tooltip } from "./Tooltip";
import { waitFor } from "../../maze-utils/src";
import { getBilibiliTitleNode } from "../../maze-utils/src/elements";
import { addCleanupListener } from "../../maze-utils/src/cleanup";

const id = "categoryPill";

export class CategoryPill {
    container: HTMLElement;
    ref: React.RefObject<CategoryPillComponent>;
    root: Root;

    lastState: CategoryPillState;

    mutationObserver?: MutationObserver;
    vote: (type: number, UUID: SegmentUUID, category?: Category) => Promise<VoteResponse>;

    constructor() {
        this.ref = React.createRef();

        addCleanupListener(() => {
            if (this.mutationObserver) {
                this.mutationObserver.disconnect();
            }
        });
    }

    async attachToPage(vote: (type: number, UUID: SegmentUUID, category?: Category) => Promise<VoteResponse>): Promise<void> {
        this.vote = vote;

        this.attachToPageInternal();
    }

    private async attachToPageInternal(): Promise<void> {
        const referenceNode =
            await waitFor(() => getBilibiliTitleNode());

        if (referenceNode && !referenceNode.contains(this.container)) {
            if (!this.container) {
                this.container = document.createElement('span');
                this.container.id = id;
                this.container.style.display = "relative";

                this.root = createRoot(this.container);
                this.ref = React.createRef();
                this.root.render(<CategoryPillComponent
                        ref={this.ref}
                        vote={this.vote}
                        showTextByDefault={true}
                        showTooltipOnClick={false} />);
            }

            if (this.lastState) {
                waitFor(() => this.ref.current).then(() => {
                    this.ref.current?.setState(this.lastState);
                });
            }

            // Use a parent because YouTube does weird things to the top level object
            // react would have to rerender if container was the top level
            const parent = document.createElement("span");
            parent.id = "categoryPillParent";
            parent.appendChild(this.container);

            referenceNode.prepend(parent);
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
            open: show ? this.ref.current?.state.open : false
        };

        this.ref.current?.setState(newState);
        this.lastState = newState;
    }

    async setSegment(segment: SponsorTime): Promise<void> {
        if (this.ref.current?.state?.segment !== segment) {
            const newState = {
                segment,
                show: true,
                open: false
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
                        timeout: 50000
                    });
                }
            }
        }
    }
}