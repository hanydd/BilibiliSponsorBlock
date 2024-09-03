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
    ref: React.RefObject<PlayerButtonGroupComponent>;
    root: Root;
    container: HTMLElement;

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
        this.ref = React.createRef<PlayerButtonGroupComponent>();
        const existingContainer = document.getElementById(containerId);
        if (existingContainer) {
            existingContainer.remove();
        }
        this.startSegmentCallback = startSegmentCallback;
        this.cancelSegmentCallback = cancelSegmentCallback;
        this.deleteCallback = deleteCallback;
        this.submitCallback = submitCallback;
        this.infoCallback = infoCallback;
    }

    public async createButtons(): Promise<
        Record<string, { button: HTMLButtonElement; image: HTMLImageElement; setupListener: boolean }>
    > {
        const controlsContainer = await waitForElement(".bpx-player-control-bottom-right").catch(() => null);
        console.log("controlsContainer", controlsContainer);
        if (!controlsContainer) {
            console.log("Could not find control button containers");
            return null;
        }

        // wait for controls buttons to be loaded
        await waitFor(() => getControls().childElementCount > 4).catch(() => {
            console.log("Get control chilren time out");
        });

        if (!this.container) {
            this.container = document.createElement("div");
            this.container.id = containerId;
            this.container.style.display = "contents";
            this.root = createRoot(this.container);
            this.root.render(
                <PlayerButtonGroupComponent
                    ref={this.ref}
                    startSegmentCallback={this.startSegmentCallback}
                    cancelSegmentCallback={this.cancelSegmentCallback}
                    deleteCallback={this.deleteCallback}
                    submitCallback={this.submitCallback}
                    infoCallback={this.infoCallback}
                />
            );
            controlsContainer.prepend(this.container);
        }

        // wait a tick for React to render the buttons
        return new Promise((resolve) => {
            setTimeout(() => {
                const playerButtons = {
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
                    AnimationUtils.setupAutoHideAnimation(playerButtons.info.button, controlsContainer);
                }

                resolve(playerButtons);
            }, 10);
        });
    }
}
