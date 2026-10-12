import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import PlayerButtonGroupComponent, { PlayerButtonGroupHandle } from "../components/playerButtons/PlayerButtonGroupComponent";
import Config from "../config";
import { PlayerUIReadySnapshot, waitForPlayerUiReady } from "../content/playerUi";
import { AnimationUtils } from "../utils/animationUtils";
import { logUiLifecycle } from "../utils/logger";
import { SponsorTime } from "../types";

const containerId = "bsbPlayerButtonContainer";
type PlayerButtons = Record<string, { button: HTMLButtonElement; image: HTMLImageElement }>;

export class PlayerButton {
    static nextDebugId = 1;

    readonly debugId: number;
    root: Root;
    container: HTMLElement;
    playerButtons: PlayerButtons;
    creationPromise: Promise<PlayerButtons>;
    private readiness: Promise<PlayerUIReadySnapshot> | null = null;
    private segments: SponsorTime[] = [];

    buttonRef: React.MutableRefObject<PlayerButtonGroupHandle> = { current: null };

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
        this.debugId = PlayerButton.nextDebugId++;
        this.startSegmentCallback = startSegmentCallback;
        this.cancelSegmentCallback = cancelSegmentCallback;
        this.deleteCallback = deleteCallback;
        this.submitCallback = submitCallback;
        this.infoCallback = infoCallback;
    }

    public async createButtons(snapshot?: PlayerUIReadySnapshot): Promise<PlayerButtons> {
        if (!snapshot && this.creationPromise) return this.creationPromise;
        const { rightControls } = snapshot ?? await (this.readiness ??= waitForPlayerUiReady()
            .finally(() => { this.readiness = null; }));
        // A host can be replaced between resolving readiness and resuming a caller.
        if (!rightControls.isConnected) return this.createButtons();

        if (!this.container) {
            this.container = document.createElement("div");
            this.container.id = containerId;
            this.container.style.display = "flex";
            this.root = createRoot(this.container);
            this.creationPromise = new Promise((resolve) => {
                this.root.render(
                    <PlayerButtonGroupComponent
                        ref={(component) => {
                            this.buttonRef.current = component;
                            if (!component || this.playerButtons) return;
                            this.playerButtons = Object.fromEntries(["submit", "info"].map(id => [id, {
                                button: this.container.querySelector<HTMLButtonElement>(`#${id}Button`),
                                image: this.container.querySelector<HTMLImageElement>(`#${id}Image`),
                            }]));
                            component.setSetgments(this.segments);
                            if (Config.config.autoHideInfoButton) {
                                AnimationUtils.setupAutoHideAnimation(this.playerButtons.info.button, this.container);
                            }
                            logUiLifecycle("playerButtons", "ready", {
                                target: "buttons", debugId: this.debugId, container: this.container,
                            });
                            resolve(this.playerButtons);
                        }}
                        startSegmentCallback={this.startSegmentCallback}
                        cancelSegmentCallback={this.cancelSegmentCallback}
                        deleteCallback={this.deleteCallback}
                        submitCallback={this.submitCallback}
                        infoCallback={this.infoCallback}
                    />
                );
            });
        }
        // Move the root immediately, even if a previous React commit is still
        // pending. Its completion must never move it back to a discarded host.
        if (this.container.parentElement !== rightControls) {
            rightControls.prepend(this.container);
            logUiLifecycle("playerButtons", "attach", {
                action: "mount", debugId: this.debugId, controlsContainer: rightControls,
            });
        }
        return this.creationPromise;
    }

    public updateSegmentSubmitting(segments: SponsorTime[]): void {
        this.segments = segments;
        this.buttonRef.current?.setSetgments(segments);
    }
}
