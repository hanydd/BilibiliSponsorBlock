import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { PlayerButtonGroupComponent } from "../components/PlayerButtonComponent";
import Config from "../config";
import { AnimationUtils } from "../utils/animationUtils";
import { waitFor } from "../utils/index";
import { getControls } from "../utils/pageUtils";

const containerId = "bsbPlayerButtonContainer";

export class PlayerButton {
    ref: React.RefObject<PlayerButtonGroupComponent>;
    root: Root;
    container: HTMLElement;

    constructor(
        startSegmentCallback: () => void,
        cancelSegmentCallback: () => void,
        deleteCallback: () => void,
        submitCallback: () => void,
        infoCallback: () => void
    ) {
        this.ref = React.createRef();
        const existingContainer = document.getElementById(containerId);
        if (existingContainer) {
            this.container = existingContainer;
            return;
        }

        this.container = document.createElement("div");
        this.container.id = containerId;
        this.container.style.display = "contents";
        this.root = createRoot(this.container);
        this.root.render(
            <PlayerButtonGroupComponent
                ref={this.ref}
                startSegmentCallback={startSegmentCallback}
                cancelSegmentCallback={cancelSegmentCallback}
                deleteCallback={deleteCallback}
                submitCallback={submitCallback}
                infoCallback={infoCallback}
            />
        );
    }

    public async createButtons(): Promise<
        Record<string, { button: HTMLButtonElement; image: HTMLImageElement; setupListener: boolean }>
    > {
        const controlsContainer = await waitFor(getControls, 10000).catch();
        await waitFor(() => getControls().childElementCount > 4); // wait for controls buttons to be loaded

        controlsContainer.prepend(this.container);

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

        return playerButtons;
    }
}
