import Config from "../config";
import { ChapterVote } from "../render/ChapterVote";
import { SponsorHideType, SponsorSourceType, SponsorTime } from "../types";
import { DEFAULT_CATEGORY, shortCategoryName } from "../utils/categoryUtils";

import { clipTimelineSegments, SegmentOverlayRenderer, TimelineSegment as PreviewBarSegment } from "../player/SegmentOverlayRenderer";
import type { TimelineTarget, TimelineTooltip } from "../player/TimelineAdapter";

const TOOLTIP_VISIBLE_CLASS = "sponsorCategoryTooltipVisible";

export type { TimelineSegment as PreviewBarSegment } from "../player/SegmentOverlayRenderer";

class PreviewBar {
    private renderer = new SegmentOverlayRenderer();
    private tooltipTarget?: TimelineTooltip;
    private disposeTooltip?: () => void;
    categoryTooltip?: HTMLDivElement;
    categoryTooltipContainer?: HTMLElement;
    lastSmallestSegment: Record<string, { index: number; segment: PreviewBarSegment }> = {};
    segments: PreviewBarSegment[] = [];
    existingChapters: PreviewBarSegment[] = [];
    videoDuration = 0;

    constructor(public chapterVote: ChapterVote = null) {}

    syncTargets(targets: TimelineTarget[]): void {
        this.renderer.sync(targets);
        const tooltip = targets.find(target => target.tooltip)?.tooltip;
        if (tooltip?.seekBar !== this.tooltipTarget?.seekBar || tooltip?.anchor !== this.tooltipTarget?.anchor ||
            (tooltip && !this.categoryTooltip?.isConnected)) this.setupHoverText(tooltip);
    }

    setupHoverText(target?: TimelineTooltip): void {
        this.disposeTooltip?.();
        this.disposeTooltip = undefined;
        this.categoryTooltip?.remove();
        this.categoryTooltip = undefined;
        this.categoryTooltipContainer?.classList.remove(TOOLTIP_VISIBLE_CLASS);
        this.categoryTooltipContainer = undefined;
        this.tooltipTarget = target;
        if (!target) return;

        const tooltip = target.container.ownerDocument.createElement("div");
        tooltip.id = "sponsorTooltip";
        tooltip.className = `${target.className} sponsorCategoryTooltip`;
        target.anchor.after(tooltip);
        this.categoryTooltip = tooltip;
        this.categoryTooltipContainer = target.container;
        let mouseOnSeekBar = false;
        const enter = () => { mouseOnSeekBar = true; };
        const leave = () => { mouseOnSeekBar = false; };
        const move = (event: MouseEvent) => {
            if (!mouseOnSeekBar || !chrome.runtime?.id) return;
            const bounds = target.seekBar.getBoundingClientRect();
            if (bounds.width <= 0) return;
            const time = this.decimalToTime((event.clientX - bounds.x) / bounds.width);
            this.setTooltipTitle(this.getSmallestSegment(time, this.segments, "normal"), tooltip);
        };
        target.seekBar.addEventListener("mouseenter", enter);
        target.seekBar.addEventListener("mouseleave", leave);
        target.seekBar.addEventListener("mousemove", move);
        this.disposeTooltip = () => {
            target.seekBar.removeEventListener("mouseenter", enter);
            target.seekBar.removeEventListener("mouseleave", leave);
            target.seekBar.removeEventListener("mousemove", move);
        };
    }

    private setTooltipTitle(segment: PreviewBarSegment, tooltip: HTMLElement): void {
        if (segment) {
            const name = shortCategoryName(segment.category);
            tooltip.textContent = segment.unsubmitted ? chrome.i18n.getMessage("unsubmitted") + " " + name : name;
            tooltip.style.removeProperty("display");
        } else tooltip.style.display = "none";
    }

    clear(): void {
        this.segments = [];
        this.lastSmallestSegment = {};
        this.renderer.render([], this.videoDuration);
        this.chapterVote?.setVisibility(false);
    }

    set(segments: PreviewBarSegment[], videoDuration: number): void {
        this.videoDuration = Number.isFinite(videoDuration) && videoDuration > 0 ? videoDuration : 0;
        this.segments = clipTimelineSegments(segments, this.videoDuration);
        this.lastSmallestSegment = {};
        this.renderer.render(this.segments, this.videoDuration);
    }

    updateChapterText(segments: SponsorTime[], submittingSegments: SponsorTime[], currentTime: number): SponsorTime[] {
        if (
            !Config.config.showSegmentNameInChapterBar ||
            ((!segments || segments.length <= 0) && submittingSegments?.length <= 0)
        ) {
            const chaptersContainer = this.getChaptersContainer();
            if (chaptersContainer) {
                chaptersContainer.querySelector(".sponsorChapterText")?.remove();
                const chapterTitle = chaptersContainer.querySelector(".ytp-chapter-title-content") as HTMLDivElement;

                chapterTitle.style.removeProperty("display");
                chaptersContainer.classList.remove("sponsorblock-chapter-visible");
            }

            return [];
        }

        segments ??= [];
        if (submittingSegments?.length > 0) segments = segments.concat(submittingSegments);
        const activeSegments = segments.filter((segment) => {
            return (
                segment.hidden === SponsorHideType.Visible &&
                segment.segment[0] <= currentTime &&
                segment.segment[1] > currentTime &&
                segment.category !== DEFAULT_CATEGORY
            );
        });

        this.setActiveSegments(activeSegments);
        return activeSegments;
    }

    /**
     * Adds the text to the chapters slot if not filled by default
     */
    private setActiveSegments(segments: SponsorTime[]): void {
        const chaptersContainer = this.getChaptersContainer();

        if (chaptersContainer) {
            if (segments.length > 0) {
                chaptersContainer.classList.add("sponsorblock-chapter-visible");

                const chosenSegment = segments.sort((a, b) => {
                    return b.segment[0] - a.segment[0];
                })[0];

                const chapterButton = this.getChapterButton(chaptersContainer);
                chapterButton.classList.remove("ytp-chapter-container-disabled");
                chapterButton.disabled = false;

                const chapterTitle = chaptersContainer.querySelector(".ytp-chapter-title-content") as HTMLDivElement;
                chapterTitle.style.display = "none";

                const chapterCustomText = (chapterTitle.parentElement.querySelector(".sponsorChapterText") ||
                    (() => {
                        const elem = document.createElement("div");
                        chapterTitle.parentElement.insertBefore(elem, chapterTitle);
                        elem.classList.add("sponsorChapterText");
                        return elem;
                    })()) as HTMLDivElement;
                chapterCustomText.innerText = shortCategoryName(chosenSegment.category);

                // if (chosenSegment.actionType !== ActionType.Chapter) {
                //     chapterTitle.classList.add("sponsorBlock-segment-title");
                // } else {
                chapterTitle.classList.remove("sponsorBlock-segment-title");
                // }

                if (chosenSegment.source === SponsorSourceType.Server) {
                    const chapterVoteContainer = this.chapterVote.getContainer();
                    if (!chapterButton.contains(chapterVoteContainer)) {
                        const oldVoteContainers = document.querySelectorAll("#chapterVote");
                        if (oldVoteContainers.length > 0) {
                            oldVoteContainers.forEach((oldVoteContainer) => oldVoteContainer.remove());
                        }

                        chapterButton.insertBefore(chapterVoteContainer, this.getChapterChevron());
                    }

                    this.chapterVote.setVisibility(true);
                    this.chapterVote.setSegment(chosenSegment);
                } else {
                    this.chapterVote.setVisibility(false);
                }
            } else {
                chaptersContainer.querySelector(".sponsorChapterText")?.remove();
                const chapterTitle = chaptersContainer.querySelector(".ytp-chapter-title-content") as HTMLDivElement;

                chapterTitle.style.removeProperty("display");
                chaptersContainer.classList.remove("sponsorblock-chapter-visible");

                this.chapterVote.setVisibility(false);
            }
        }
    }

    private getChaptersContainer(): HTMLElement {
        return document.querySelector(".ytp-chapter-container") as HTMLElement;
    }

    private getChapterButton(chaptersContainer: HTMLElement): HTMLButtonElement {
        return (chaptersContainer ?? this.getChaptersContainer())?.querySelector(
            "button.ytp-chapter-title"
        ) as HTMLButtonElement;
    }

    remove(): void {
        this.renderer.remove();
        this.setupHoverText();
    }

    intervalToPercentage(startTime: number, endTime: number) {
        return `${this.intervalToDecimal(startTime, endTime) * 100}%`;
    }

    intervalToDecimal(startTime: number, endTime: number) {
        return this.timeToDecimal(endTime) - this.timeToDecimal(startTime);
    }

    timeToPercentage(time: number): string {
        return `${this.timeToDecimal(time) * 100}%`;
    }

    timeToRightPercentage(time: number): string {
        return `${(1 - this.timeToDecimal(time)) * 100}%`;
    }

    timeToDecimal(time: number): number {
        return this.decimalTimeConverter(time, true);
    }

    decimalToTime(decimal: number): number {
        return this.decimalTimeConverter(decimal, false);
    }

    /**
     * Decimal to time or time to decimal
     */
    decimalTimeConverter(value: number, isTime: boolean): number {
        if (isTime) {
            return Math.min(1, value / this.videoDuration);
        } else {
            return Math.max(0, value * this.videoDuration);
        }
    }

    /*
     * Approximate size on preview bar for smallest element (due to &nbsp)
     */
    getMinimumSize(showLarger = false): number {
        return this.videoDuration * (showLarger ? 0.006 : 0.003);
    }

    // Name parameter used for cache
    private getSmallestSegment(
        timeInSeconds: number,
        segments: PreviewBarSegment[],
        name?: string
    ): PreviewBarSegment | null {
        const proposedIndex = name ? this.lastSmallestSegment[name]?.index : null;
        const startSearchIndex =
            proposedIndex && segments[proposedIndex] === this.lastSmallestSegment[name].segment ? proposedIndex : 0;
        const direction =
            startSearchIndex > 0 && timeInSeconds < this.lastSmallestSegment[name].segment.segment[0] ? -1 : 1;

        let segment: PreviewBarSegment | null = null;
        let index = -1;
        let currentSegmentLength = Infinity;

        for (let i = startSearchIndex; i < segments.length && i >= 0; i += direction) {
            const seg = segments[i];
            const segmentLength = seg.segment[1] - seg.segment[0];
            const minSize = this.getMinimumSize(seg.showLarger);

            const startTime = segmentLength !== 0 ? seg.segment[0] : Math.floor(seg.segment[0]);
            const endTime = segmentLength > minSize ? seg.segment[1] : Math.ceil(seg.segment[0] + minSize);
            if (startTime <= timeInSeconds && endTime >= timeInSeconds) {
                if (segmentLength < currentSegmentLength) {
                    currentSegmentLength = segmentLength;
                    segment = seg;
                    index = i;
                }
            }

            if (direction === 1 && seg.segment[0] > timeInSeconds) {
                break;
            }
        }

        if (segment) {
            this.lastSmallestSegment[name] = {
                index: index,
                segment: segment,
            };
        }

        return segment;
    }

    private getChapterChevron(): HTMLElement {
        return document.querySelector(".ytp-chapter-title-chevron");
    }
}

export default PreviewBar;
