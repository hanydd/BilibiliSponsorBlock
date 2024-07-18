import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { DescriptionPortPillComponent } from "../components/DescriptionPortPillComponent";
import { VideoID } from "../types";
import { waitFor } from "../../maze-utils/src";
import { getPageLoaded } from "../content";
import { asyncRequestToServer } from "../utils/requests";


const id = "bsbDescriptionContainer";

export class DescriptionPortPill {
    bvID: VideoID;
    ytbID: VideoID;
    portUUID: string;

    container: HTMLElement;
    ref: React.RefObject<DescriptionPortPillComponent>;
    root: Root;

    async setupDecription(videoId: VideoID) {
        if (this.bvID === videoId) {
            return;
        }
        this.bvID = videoId;

        this.cleanup();

        // make request to get the port video
        const response = await asyncRequestToServer("GET", "/api/portVideo", { videoID: videoId });
        if (response?.ok) {
            const responseData = JSON.parse(response.responseText);
            console.log(responseData);
            if (responseData?.bvID == this.bvID) {
                this.ytbID = responseData.ytbID;
                this.portUUID = responseData.UUID;
            }
        }

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
                bvID={this.bvID}
                ytbID={this.ytbID}
            />
        );

        referenceNode.prepend(this.container);
    }

    cleanup() {
        this.root?.unmount();
        this.container?.remove();

        this.root = null;
        this.container = null;
    }
}