import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { DescriptionPortPillComponent } from "../components/DescriptionPortPillComponent";
import { VideoID } from "../types";
import { waitFor } from "../../maze-utils/src";
import { getPageLoaded } from "../content";
import { asyncRequestToServer } from "../utils/requests";
import { getVideo, getVideoID } from "../../maze-utils/src/video";
import Config from "../config";

const id = "bsbDescriptionContainer";

export interface PortVideo {
    bvID: VideoID;
    ytbID: VideoID;
    UUID: string;
    votes: number;
    locked: boolean;
}

export class DescriptionPortPill {
    bvID: VideoID;
    ytbID: VideoID;
    portUUID: string;

    inputContainer: HTMLElement;
    buttonContainer: HTMLElement;
    ref: React.RefObject<DescriptionPortPillComponent>;
    root: Root;

    async setupDecription(videoId: VideoID) {
        if (this.bvID === videoId) {
            return;
        }
        this.bvID = videoId;

        this.cleanup();

        // make request to get the port video
        const response = await asyncRequestToServer("GET", "/api/portVideo", { videoID: videoId }).catch((e) => {
            console.log(e);
        });
        if (response && response?.ok) {
            const responseData = JSON.parse(response.responseText);
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
        await waitFor(() => referenceNode.querySelector(".desc-info-text")?.textContent, 20000, 50).catch(() => {
            console.error("Failed to find description text element");
            return;
        });

        this.attachToPage(referenceNode);
    }

    private attachToPage(referenceNode: HTMLElement) {
        this.attachInputToPage(referenceNode);
        this.attachButtonToPage();
    }

    private attachInputToPage(referenceNode: HTMLElement) {
        this.inputContainer = document.createElement("div");
        this.inputContainer.id = id;

        this.root = createRoot(this.inputContainer);
        this.ref = React.createRef();
        this.root.render(
            <DescriptionPortPillComponent
                ref={this.ref}
                bvID={this.bvID}
                ytbID={this.ytbID}
                showYtbVideoButton={true}
                onSubmitPortVideo={(ytbID) => this.submitPortVideo(ytbID)}
                onVote={(type) => this.vote(type)}
            />
        );

        referenceNode.prepend(this.inputContainer);
    }

    private attachButtonToPage() {
        const referenceNode = document.querySelector(".video-toolbar-right") as HTMLElement;
        if (!referenceNode) {
            console.error("Video toolbar not found");
            return;
        }

        const buttonContainer = document.createElement("div");
        buttonContainer.id = "bsbPortButton";
        buttonContainer.addEventListener("click", () => {
            this.ref.current.toggleInput();
        });

        const newButtonImage = document.createElement("img");
        newButtonImage.id = "bsbPortButtonImage";
        newButtonImage.src = chrome.runtime.getURL("icons/youtubeLogo.svg");
        newButtonImage.title = "绑定搬运视频";
        buttonContainer.appendChild(newButtonImage);

        const newButtonText = document.createElement("span");
        newButtonText.id = "bsbPortButtonText";
        newButtonText.textContent = "绑定搬运视频";
        buttonContainer.appendChild(newButtonText);

        referenceNode.prepend(buttonContainer);
        this.buttonContainer = buttonContainer;
    }

    cleanup() {
        this.root?.unmount();
        this.inputContainer?.remove();
        this.buttonContainer?.remove();

        this.root = null;
        this.inputContainer = null;
        this.buttonContainer = null;
        this.ytbID = null;
        this.portUUID = null;
    }

    private async submitPortVideo(ytbID: VideoID): Promise<PortVideo> {
        const response = await asyncRequestToServer("POST", "/api/portVideo", {
            bvID: getVideoID(),
            ytbID,
            biliDuration: getVideo().duration,
            userID: Config.config.userID,
            userAgent: `${chrome.runtime.id}/v${chrome.runtime.getManifest().version}`,
        });
        if (response?.ok) {
            const newPortVideo = JSON.parse(response.responseText) as PortVideo;
            this.ytbID = ytbID;
            this.portUUID = newPortVideo.UUID;

            return newPortVideo;
        }
        return null;
    }

    private async vote(voteType: number) {
        if (!this.portUUID) {
            console.error("No port video to vote on");
            return;
        }

        const response = await asyncRequestToServer("POST", "/api/votePort", {
            UUID: this.portUUID,
            bvID: this.bvID,
            userID: Config.config.userID,
            type: voteType,
        });
        if (response?.ok) {
            console.log("Vote successful", response);
        } else {
            console.error("Vote failed", response);
        }
    }
}
