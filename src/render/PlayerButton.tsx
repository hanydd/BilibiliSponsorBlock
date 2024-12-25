import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import PlayerButtonGroupComponent from "../components/playerButtons/PlayerButtonGroupComponent";
import Config from "../config";
import { AnimationUtils } from "../utils/animationUtils";
import { waitForElement } from "../utils/dom";
import { waitFor } from "../utils/index";
import { getControls } from "../utils/pageUtils";
import { SponsorTime } from "../types";

const containerId = "bsbPlayerButtonContainer";

export class PlayerButton {
    root: Root;
    container: HTMLElement;
    playerButtons: Record<string, { button: HTMLButtonElement; image: HTMLImageElement }>;
    creatingButtons: boolean;

    buttonRef: React.RefObject<{ setSetgments(segments: SponsorTime[]): void }>;

    startSegmentCallback: () => void;
    cancelSegmentCallback: () => void;
    deleteCallback: () => void;
    submitCallback: () => void;
    infoCallback: () => void;

    constructor(
        startSegmentCallback: () => void,
        cancelSegmentCallback: () => void,
        deleteCallback: () => void,
        submitCallback: () => void,
        infoCallback: () => void
    ) {
        const existingContainer = document.getElementById(containerId);
        if (existingContainer) {
            existingContainer.remove();
        }
        this.startSegmentCallback = startSegmentCallback;
        this.cancelSegmentCallback = cancelSegmentCallback;
        this.deleteCallback = deleteCallback;
        this.submitCallback = submitCallback;
        this.infoCallback = infoCallback;

        this.creatingButtons = false;

        this.buttonRef = React.createRef();
    }

    public async createButtons(): Promise<Record<string, { button: HTMLButtonElement; image: HTMLImageElement }>> {
        if (this.playerButtons) {
            return this.playerButtons;
        }

        const controlsContainer = await waitForElement(".bpx-player-control-bottom-right").catch(() => null);
        if (!controlsContainer) {
            console.log("Could not find control button containers");
            return null;
        }

        if (!this.container) {
            // wait for controls buttons to be loaded
            await waitFor(() => getControls().childElementCount > 4).catch(() => {
                console.log("Get control chilren time out");
            });

            if (this.creatingButtons) {
                await waitFor(() => this.playerButtons !== undefined, 5000, 10);
                return this.playerButtons;
            }

            this.creatingButtons = true;
            this.container = document.createElement("div");
            this.container.id = containerId;
            this.container.style.display = "flex";
            this.root = createRoot(this.container);
            this.root.render(
                <PlayerButtonGroupComponent
                    ref={this.buttonRef}
                    startSegmentCallback={this.startSegmentCallback}
                    cancelSegmentCallback={this.cancelSegmentCallback}
                    deleteCallback={this.deleteCallback}
                    submitCallback={this.submitCallback}
                    infoCallback={this.infoCallback}
                />
            );
            controlsContainer.prepend(this.container);

            // wait a tick for React to render the buttons
            await this.waitForRender();
            this.playerButtons = {
                submit: {
                    button: document.getElementById("submitButton") as HTMLButtonElement,
                    image: document.getElementById("submitImage") as HTMLImageElement,
                },
                info: {
                    button: document.getElementById("infoButton") as HTMLButtonElement,
                    image: document.getElementById("infoImage") as HTMLImageElement,
                },
            };
            if (Config.config.autoHideInfoButton) {
                AnimationUtils.setupAutoHideAnimation(this.playerButtons.info.button, this.container);
            }
            this.creatingButtons = false;
        }
        return this.playerButtons;
    }

    public async updateSegmentSubmitting(segments: SponsorTime[]) {
        await this.waitForRender();
        this.buttonRef.current.setSetgments(segments);
    }

    private async waitForRender() {
        await waitFor(() => document.getElementById("submitButton"), 5000, 10);
        await waitFor(() => document.getElementById("infoButton"), 5000, 10);
        await waitFor(() => this.buttonRef?.current, 5000, 10);
    }
}
