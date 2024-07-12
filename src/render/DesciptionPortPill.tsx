import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { DescriptionPortPillComponent } from "../components/DescriptionPortPillComponent";
import { VideoID } from "../types";
import { waitFor } from "../../maze-utils/src";
import { getPageLoaded } from "../content";


const id = "bsbDescriptionContainer";

export class DescriptionPortPill {
    videoID: VideoID;
    container: HTMLElement;
    ref: React.RefObject<DescriptionPortPillComponent>;
    root: Root;

    async setupDecription(videoId: VideoID) {
        if (this.videoID === videoId) {
            return;
        }
        this.cleanup();

        this.videoID = videoId;
        const referenceNode = await waitFor(() => document.querySelector("#v_desc .basic-desc-info") as HTMLElement);
        if (!referenceNode) {
            console.error("Description element not found");
        }

        // wait for the sibling span to load
        await waitFor(getPageLoaded, 20000, 10);
        await waitFor(() => referenceNode.querySelector(".desc-info-text")?.textContent, 20000, 50)
            .catch(() => {
                console.error("Failed to find description text element");
                return;
            });

        this.attachToPage(referenceNode);
    }

    attachToPage(referenceNode: HTMLElement) {
        this.container = document.createElement("div");
        this.container.id = id;

        this.root = createRoot(this.container);
        this.ref = React.createRef();
        this.root.render(
            <DescriptionPortPillComponent
                ref={this.ref}
            />
        );

        referenceNode.appendChild(this.container);
    }

    cleanup() {
        this.root?.unmount();
        this.container?.remove();

        this.root = null;
        this.container = null;
    }
}