import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { PlayerButtonGroupComponent } from "../components/PlayerButtonComponent";
import Config from "../config";
import { AnimationUtils } from "../utils/animationUtils";
import { waitForElement } from "../utils/dom";
import { waitFor } from "../utils/index";
import { getControls } from "../utils/pageUtils";

const containerId = "bsbPlayerButtonContainer";

export class PlayerButton {
    root: Root;
    container: HTMLElement;
    playerButtons: Record<string, { button: HTMLButtonElement; image: HTMLImageElement; setupListener: boolean }>;
    creatingButtons: boolean;

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
    }

    public async createButtons(): Promise<
        Record<string, { button: HTMLButtonElement; image: HTMLImageElement; setupListener: boolean }>
    > {
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
            this.container.style.display = "contents";
            this.root = createRoot(this.container);
            this.root.render(
                <PlayerButtonGroupComponent
                    startSegmentCallback={this.startSegmentCallback}
                    cancelSegmentCallback={this.cancelSegmentCallback}
                    deleteCallback={this.deleteCallback}
                    submitCallback={this.submitCallback}
                    infoCallback={this.infoCallback}
                />
            );
            controlsContainer.prepend(this.container);

            // wait a tick for React to render the buttons
            await waitFor(() => document.getElementById("infoButton"), 5000, 10);
            this.playerButtons = {
                startSegment: {
                    button: document.getElementById("startSegmentButton") as HTMLButtonElement,
                    image: document.getElementById("startSegmentImage") as HTMLImageElement,
                    setupListener: false,
                },
                cancelSegment: {
                    button: document.getElementById("cancelSegmentButton") as HTMLButtonElement,
                    image: document.getElementById("cancelSegmentImage") as HTMLImageElement,
                    setupListener: false,
                },
                delete: {
                    button: document.getElementById("deleteButton") as HTMLButtonElement,
                    image: document.getElementById("deleteImage") as HTMLImageElement,
                    setupListener: false,
                },
                submit: {
                    button: document.getElementById("submitButton") as HTMLButtonElement,
                    image: document.getElementById("submitImage") as HTMLImageElement,
                    setupListener: false,
                },
                info: {
                    button: document.getElementById("infoButton") as HTMLButtonElement,
                    image: document.getElementById("infoImage") as HTMLImageElement,
                    setupListener: false,
                },
            };
            if (Config.config.autoHideInfoButton) {
                AnimationUtils.setupAutoHideAnimation(this.playerButtons.info.button, controlsContainer);
            }
            this.creatingButtons = false;
        }
        return this.playerButtons;
    }
}
