import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { DescriptionPortPillComponent } from "../components/DescriptionPortPillComponent";
import { VideoID } from "../types";
import { waitFor } from "../utils/";
import { getPageLoaded } from "../content";
import { asyncRequestToServer } from "../requests/requests";
import { getVideo, getVideoID } from "../utils/video";
import Config from "../config";
import { getPortVideoByHash } from "../requests/portVideo";
import { getVideoDescriptionFromWindow } from "../utils/injectedScriptMessageUtils";
import YouTubeLogoButton from '../components/YouTubeLogoButton';

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
    hasDescription: boolean;
    sponsorsLookup: (keepOldSubmissions: boolean, ignoreServerCache: boolean, forceUpdatePreviewBar: boolean) => void;

    inputContainer: HTMLElement;
    buttonContainer: HTMLElement;
    ref: React.RefObject<DescriptionPortPillComponent>;
    root: Root;

    constructor(sponsorsLookup: () => void) {
        this.sponsorsLookup = sponsorsLookup;
    }

    async setupDecription(videoId: VideoID) {
        if (!Config.config.showPortVideoButton) {
            return;
        }
        if (this.bvID === videoId) {
            return;
        }
        this.bvID = videoId;

        this.cleanup();

        // make request to get the port video first, while waiting for the page to load
        await this.getPortVideo(videoId);

        const referenceNode = await waitFor(() => document.querySelector(".basic-desc-info") as HTMLElement);
        if (!referenceNode) {
            console.error("Description element not found");
        }

        // wait for the sibling span to load, only when there is a description
        await waitFor(getPageLoaded, 20000, 10);
        const desc = await getVideoDescriptionFromWindow();
        this.hasDescription = desc && desc !== "";
        if (this.hasDescription) {
            await waitFor(() => referenceNode.querySelector(".desc-info-text")?.textContent, 20000, 50).catch(() => {
                console.error("Failed to find description text element");
                return;
            });
        }

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
                showYtbVideoButton={Config.config.showPreviewYoutubeButton}
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

        document.querySelector("#bsbPortButton")?.remove();
        const buttonContainer = document.createElement("div");
        buttonContainer.id = "bsbPortButton";

        const root = createRoot(buttonContainer);
        root.render(
            <YouTubeLogoButton
                isBound={Boolean(this.ytbID)}
                onClick={() => {
                    this.ref.current.toggleInput();
                    // toggle display state of the input container
                    if (!this.hasDescription) {
                        const container = document.querySelector("div.video-desc-container") as HTMLDivElement;
                        if (!container) {
                            return;
                        }
                        if (container.style.display === "none") {
                            container.style.display = "block";
                        } else if (container.style.display === "block") {
                            container.style.display = "none";
                        }
                    }
                }}
                title={chrome.i18n.getMessage("bindPortVideoButton")}
            />
        );

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

    private async getPortVideo(videoId: VideoID, bypassCache = false) {
        const portVideo = await getPortVideoByHash(videoId, { bypassCache });
        if (portVideo) {
            this.ytbID = portVideo.ytbID;
            this.portUUID = portVideo.UUID;
        } else {
            this.ytbID = null;
            this.portUUID = null;
        }
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

            this.sponsorsLookup(true, true, true);

            return newPortVideo;
        } else {
            throw response.responseText;
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
        if (!response?.ok) {
            throw response?.responseText ? response.responseText : "投票失败！";
        }

        await this.getPortVideo(this.bvID, true);
        this.ref.current.setState({ ytbVideoID: this.ytbID, previewYtbID: this.ytbID });
    }
}
