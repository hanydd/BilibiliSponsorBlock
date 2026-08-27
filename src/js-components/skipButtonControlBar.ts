import Config from "../config";
import { keybindToString } from "../config/config";
import { waitForPlayerUiReady } from "../content/playerUi";
import { getPageLoaded } from "../content/state";
import { SegmentUUID, SponsorTime } from "../types";
import { getSkippingText } from "../utils/categoryUtils";
import { waitFor } from "../utils/index";
import { logUiLifecycle } from "../utils/logger";

export interface SkipButtonControlBarProps {
    skip: (segment: SponsorTime) => void;
    selectSegment: (UUID: SegmentUUID) => void;
}

export class SkipButtonControlBar {
    static nextDebugId = 1;

    readonly debugId: number;
    container: HTMLElement;
    skipButton: HTMLButtonElement;
    skipIcon: HTMLImageElement;
    // textContainer: HTMLElement;
    // chapterText: HTMLElement;
    segment: SponsorTime;

    showKeybindHint = true;

    enabled = false;

    skip: (segment: SponsorTime) => void;

    constructor(props: SkipButtonControlBarProps) {
        this.debugId = SkipButtonControlBar.nextDebugId++;
        this.skip = props.skip;

        this.container = document.createElement("div");
        this.container.classList.add("skipButtonControlBarContainer");
        this.container.classList.add("sbhidden");

        this.skipButton = document.createElement("button");
        this.skipButton.classList.add("bpx-player-ctrl-btn", "playerButton");
        this.skipButton.id = "sbSkipIconControlBarButton";
        this.skipButton.draggable = false;

        this.skipIcon = document.createElement("img");
        this.skipIcon.src = chrome.runtime.getURL("icons/skipIcon.svg");
        this.skipIcon.classList.add("bpx-player-ctrl-btn-icon", "playerButtonImage");
        this.skipIcon.id = "sbSkipIconControlBarImage";
        this.skipIcon.draggable = false;

        this.skipButton.appendChild(this.skipIcon);

        // this.textContainer = document.createElement("div");

        this.container.appendChild(this.skipButton);
        // this.container.appendChild(this.textContainer);
        this.container.addEventListener("click", () => this.toggleSkip());
        this.container.addEventListener("mouseenter", () => {
            if (this.segment && this.enabled) {
                props.selectSegment(this.segment.UUID);
            }
        });
        this.container.addEventListener("mouseleave", () => {
            props.selectSegment(null);
        });
    }

    getElement(): HTMLElement {
        return this.container;
    }

    async attachToPage(): Promise<void> {
        logUiLifecycle("skipButton", "wait", {
            action: "attach",
            debugId: this.debugId,
        });
        await waitFor(getPageLoaded, 10000, 10);
        const { leftControls } = await waitForPlayerUiReady();
        const timeControl = await waitFor(
            () => leftControls.querySelector<HTMLElement>(".bpx-player-ctrl-time"),
            10000,
            50
        );
        const mountingContainer = timeControl.parentElement;
        // this.chapterText = document.querySelector(".ytp-chapter-container");

        document.querySelectorAll(".skipButtonControlBarContainer").forEach((container) => {
            if (container !== this.container) {
                container.remove();
            }
        });

        if (
            mountingContainer &&
            (this.container.parentElement !== mountingContainer || this.container.previousElementSibling !== timeControl)
        ) {
            timeControl.after(this.container);
            logUiLifecycle("skipButton", "attach", {
                action: "mount",
                debugId: this.debugId,
                mountingContainer,
            });
        }
    }

    enable(segment: SponsorTime): void {
        this.segment = segment;

        if (Config.config.hideSkipButtonPlayerControls) {
            this.disable();
            return;
        }

        this.enabled = true;

        this.refreshText();
        // this.textContainer?.classList?.remove("sbhidden");
    }

    refreshText(): void {
        if (this.segment) {
            // this.chapterText?.classList?.add("sbhidden");
            if (this.enabled) {
                this.container.classList.remove("sbhidden");
            }
            // this.textContainer.innerText = this.getTitle();
            this.skipButton.setAttribute("title", this.getTitle());
        }
    }

    setShowKeybindHint(show: boolean): void {
        this.showKeybindHint = show;

        this.refreshText();
    }

    disable(): void {
        this.container.classList.add("sbhidden");

        // this.chapterText?.classList?.remove("sbhidden");
        // this.getChapterPrefix()?.classList?.remove("sbhidden");

        this.enabled = false;
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    toggleSkip(): void {
        if (this.segment && this.enabled) {
            this.skip(this.segment);
        }
    }

    private getTitle(): string {
        return (
            getSkippingText([this.segment], false) +
            (this.showKeybindHint ? " (" + keybindToString(Config.config.skipToHighlightKeybind) + ")" : "")
        );
    }
}
