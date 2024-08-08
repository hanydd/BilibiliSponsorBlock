import Config from "../config";
import { SegmentUUID, SponsorTime } from "../types";
import { getSkippingText } from "../utils/categoryUtils";
import { AnimationUtils } from "../maze-utils/animationUtils";
import { keybindToString } from "../maze-utils/config";

export interface SkipButtonControlBarProps {
    skip: (segment: SponsorTime) => void;
    selectSegment: (UUID: SegmentUUID) => void;
}

export class SkipButtonControlBar {
    container: HTMLElement;
    skipIcon: HTMLImageElement;
    textContainer: HTMLElement;
    chapterText: HTMLElement;
    segment: SponsorTime;

    showKeybindHint = true;

    enabled = false;

    timeout: NodeJS.Timeout;
    duration = 0;

    skip: (segment: SponsorTime) => void;

    constructor(props: SkipButtonControlBarProps) {
        this.skip = props.skip;

        this.container = document.createElement("div");
        this.container.classList.add("skipButtonControlBarContainer");
        this.container.classList.add("sbhidden");

        this.skipIcon = document.createElement("img");
        this.skipIcon.src = chrome.runtime.getURL("icons/skipIcon.svg");
        this.skipIcon.classList.add("ytp-button");
        this.skipIcon.id = "sbSkipIconControlBarImage";

        this.textContainer = document.createElement("div");

        this.container.appendChild(this.skipIcon);
        this.container.appendChild(this.textContainer);
        this.container.addEventListener("click", () => this.toggleSkip());
        this.container.addEventListener("mouseenter", () => {
            this.stopTimer();

            if (this.segment) {
                props.selectSegment(this.segment.UUID);
            }
        });
        this.container.addEventListener("mouseleave", () => {
            this.startTimer();

            props.selectSegment(null);
        });
    }

    getElement(): HTMLElement {
        return this.container;
    }

    attachToPage(): void {
        const mountingContainer = this.getMountingContainer();
        this.chapterText = document.querySelector(".ytp-chapter-container");

        if (mountingContainer && !mountingContainer.contains(this.container)) {
            mountingContainer.insertBefore(this.container, this.chapterText);
            AnimationUtils.setupAutoHideAnimation(this.skipIcon, mountingContainer, false, false);
        }
    }

    private getMountingContainer(): HTMLElement {
        return document.querySelector(".ytp-left-controls");
    }

    enable(segment: SponsorTime, duration?: number): void {
        if (duration) this.duration = duration;
        this.segment = segment;
        this.enabled = true;

        this.refreshText();
        this.container?.classList?.remove("textDisabled");
        this.textContainer?.classList?.remove("sbhidden");
        AnimationUtils.disableAutoHideAnimation(this.skipIcon);

        this.startTimer();
    }

    refreshText(): void {
        if (this.segment) {
            this.chapterText?.classList?.add("sbhidden");
            this.container.classList.remove("sbhidden");
            this.textContainer.innerText = this.getTitle();
            this.skipIcon.setAttribute("title", this.getTitle());
        }
    }

    setShowKeybindHint(show: boolean): void {
        this.showKeybindHint = show;

        this.refreshText();
    }

    stopTimer(): void {
        if (this.timeout) clearTimeout(this.timeout);
    }

    startTimer(): void {
        this.stopTimer();
        this.timeout = setTimeout(
            () => this.disableText(),
            Math.max(Config.config.skipNoticeDuration, this.duration) * 1000
        );
    }

    disable(): void {
        this.container.classList.add("sbhidden");

        this.chapterText?.classList?.remove("sbhidden");
        this.getChapterPrefix()?.classList?.remove("sbhidden");

        this.enabled = false;
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    toggleSkip(): void {
        if (this.segment && this.enabled) {
            this.skip(this.segment);
            this.disableText();
        }
    }

    disableText(): void {
        if (Config.config.hideSkipButtonPlayerControls) {
            this.disable();
            return;
        }

        this.container.classList.add("textDisabled");
        this.textContainer?.classList?.add("sbhidden");
        this.chapterText?.classList?.remove("sbhidden");

        this.getChapterPrefix()?.classList?.add("sbhidden");

        AnimationUtils.enableAutoHideAnimation(this.skipIcon);
    }

    private getTitle(): string {
        return (
            getSkippingText([this.segment], false) +
            (this.showKeybindHint ? " (" + keybindToString(Config.config.skipToHighlightKeybind) + ")" : "")
        );
    }

    private getChapterPrefix(): HTMLElement {
        return document.querySelector(".ytp-chapter-title-prefix");
    }
}
