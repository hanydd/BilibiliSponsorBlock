import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { DescriptionPortPillComponent } from "../components/DescriptionPortPillComponent";
import YouTubeLogoButton from "../components/YouTubeLogoButton";
import Config from "../config";
import { getPageLoaded } from "../content";
import { FetchResponse } from "../requests/type/requestType";
import { PortVideo, BVID } from "../types";
import { waitFor } from "../utils/index";
import { waitForElement } from "../utils/dom";
import { getVideoDescriptionFromWindow } from "../utils/injectedScriptMessageUtils";
import { showMessage } from "./MessageNotice";

const id = "bsbDescriptionContainer";

export class DescriptionPortPill {
    bvID: BVID;
    ytbID: BVID;
    portUUID: string;
    hasDescription: boolean;
    getPortVideo: (videoId: BVID, bypassCache?: boolean) => void;
    submitPortVideo: (ytbID: BVID) => Promise<PortVideo>;
    portVideoVote: (UUID: string, voteType: number) => void;
    updateSegments: (UUID: string) => Promise<FetchResponse>;
    sponsorsLookup: (keepOldSubmissions: boolean, ignoreServerCache: boolean, forceUpdatePreviewBar: boolean) => void;

    inputContainer: HTMLElement;
    buttonContainer: HTMLElement;
    ref: React.RefObject<DescriptionPortPillComponent>;
    buttonRef: React.RefObject<YouTubeLogoButton>;
    root: Root;

    constructor(
        getPortVideo: (videoId: BVID, bypassCache?: boolean) => void,
        submitPortVideo: (ytbID: BVID) => Promise<PortVideo>,
        portVideoVote: (UUID: string, voteType: number) => void,
        updateSegments: (UUID: string) => Promise<FetchResponse>,
        sponsorsLookup: () => void
    ) {
        this.getPortVideo = getPortVideo;
        this.submitPortVideo = submitPortVideo;
        this.portVideoVote = portVideoVote;
        this.updateSegments = updateSegments;
        this.sponsorsLookup = sponsorsLookup;
    }

    setupDescription = async (videoId: BVID) => {
        if (!Config.config.showPortVideoButton) {
            return;
        }
        if (this.bvID === videoId) {
            return;
        }
        this.bvID = videoId;

        this.cleanup();

        this.hasDescription = true;
        const referenceNode = (await waitForElement(".basic-desc-info")) as HTMLElement;
        if (!referenceNode) {
            console.error("Description element not found");
        }

        // wait for the sibling span to load, only when there is a description
        await waitFor(getPageLoaded, 20000, 10);

        // if the desc from window object is empty, and the description container is hidden,
        // the video has no description
        const desc = await getVideoDescriptionFromWindow();
        if (!desc || desc == "") {
            const container = (await waitFor(() => document.querySelector(".video-desc-container"))) as HTMLDivElement;
            if (container.style.display == "none") {
                this.hasDescription = false;
            }
        }

        if (this.hasDescription) {
            await waitFor(() => referenceNode.querySelector(".desc-info-text")?.textContent, 20000, 50).catch(() => {
                console.error("Failed to find description text element");
                return;
            });
        }

        this.attachToPage(referenceNode);

        // wait for the element to be attached to the DOM and then get the port video data, to avoid racing conditions
        this.getPortVideo(videoId);
    };

    setPortVideoData = (portVideo: PortVideo) => {
        if (portVideo) {
            this.bvID = portVideo.bvID;
            this.ytbID = portVideo.ytbID;
            this.portUUID = portVideo.UUID;
        } else {
            this.bvID = null;
            this.ytbID = null;
            this.portUUID = null;
        }
        waitFor(() => this.ref?.current).then(() => this.ref?.current?.setPortVideoData(portVideo));
        waitFor(() => this.buttonRef?.current).then(() => this.buttonRef?.current?.setPortVideo(portVideo));
    };

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
                onRefresh={() => this.updateSegmentHandler()}
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
        this.buttonRef = React.createRef();
        root.render(
            <YouTubeLogoButton
                ref={this.buttonRef}
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

    private cleanup = () => {
        this.root?.unmount();
        this.inputContainer?.remove();
        this.buttonContainer?.remove();

        this.root = null;
        this.inputContainer = null;
        this.buttonContainer = null;
        this.ytbID = null;
        this.portUUID = null;
    };

    private vote = async (voteType: number) => {
        if (!this.portUUID) {
            console.error("No port video to vote on");
            showMessage("无法获取绑定的视频信息", "error");
            return;
        }

        this.portVideoVote(this.portUUID, voteType);
    };

    private updateSegmentHandler = async () => {
        if (!this.portUUID) {
            console.error("No port video to update segments on");
            showMessage("无法获取绑定的视频信息", "error");
            return;
        }

        const response = await this.updateSegments(this.portUUID);
        if (!response?.ok) {
            if (response.status === 429) {
                showMessage(response.responseText, "info");
            } else {
                console.error(response.responseText);
                showMessage(chrome.i18n.getMessage("refreshFailed") + response.responseText, "error");
            }
        } else {
            showMessage(chrome.i18n.getMessage("refreshSuccess"), "success");
        }
    };
}
