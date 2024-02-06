/*
Based on code from
https://github.com/videosegments/videosegments/commits/f1e111bdfe231947800c6efdd51f62a4e7fef4d4/segmentsbar/segmentsbar.js
*/

'use strict';

import Config from "../config";
import { ChapterVote } from "../render/ChapterVote";
import { ActionType, Category, SegmentContainer, SponsorHideType, SponsorSourceType, SponsorTime } from "../types";
import { DEFAULT_CATEGORY, shortCategoryName } from "../utils/categoryUtils";
import { findValidElement } from "../../maze-utils/src/dom";

const TOOLTIP_VISIBLE_CLASS = 'sponsorCategoryTooltipVisible';

export interface PreviewBarSegment {
    segment: [number, number];
    category: Category;
    actionType: ActionType;
    unsubmitted: boolean;
    showLarger: boolean;
    description: string;
    source: SponsorSourceType;
    requiredSegment?: boolean;
    selectedSegment?: boolean;
}

interface ChapterGroup extends SegmentContainer {
    originalDuration: number;
    actionType: ActionType;
}

class PreviewBar {
    container: HTMLUListElement;
    categoryTooltip?: HTMLDivElement;
    categoryTooltipContainer?: HTMLElement;
    lastSmallestSegment: Record<string, {
        index: number;
        segment: PreviewBarSegment;
    }> = {};

    parent: HTMLElement;
    progressBar: HTMLElement;

    segments: PreviewBarSegment[] = [];
    existingChapters: PreviewBarSegment[] = [];
    videoDuration = 0;
    lastChapterUpdate = 0;

    // For chapter bar
    hoveredSection: HTMLElement;
    customChaptersBar: HTMLElement;
    chaptersBarSegments: PreviewBarSegment[];
    chapterVote: ChapterVote;
    originalChapterBar: HTMLElement;
    originalChapterBarBlocks: NodeListOf<HTMLElement>;
    chapterMargin: number;
    lastRenderedSegments: PreviewBarSegment[];
    unfilteredChapterGroups: ChapterGroup[];
    chapterGroups: ChapterGroup[];

    constructor(parent: HTMLElement, chapterVote: ChapterVote, test=false) {
        if (test) return;
        this.container = document.createElement('ul');
        this.container.id = 'previewbar';

        this.parent = parent;
        this.chapterVote = chapterVote;

        this.updateProgressBarElement();
        this.createElement();
        this.setupHoverText();
    }

    setupHoverText(): void {
        // delete old ones
        document.querySelectorAll(`.sponsorCategoryTooltip`)
            .forEach((e) => e.remove());

        // Create label placeholder
        this.categoryTooltip = document.createElement("div");
        this.categoryTooltip.id = "sponsorTooltip";
        this.categoryTooltip.className = "bpx-player-progress-preview-time sponsorCategoryTooltip";

        // global chaper tooltip or duration tooltip
        this.categoryTooltipContainer = document.querySelector(".bpx-player-progress-area .bpx-player-progress-wrap .bpx-player-progress-popup");
        const tooltipTextWrapper = this.categoryTooltipContainer.querySelector(".bpx-player-progress-preview");
        const biliChapterWrapper = this.categoryTooltipContainer.querySelector(".bpx-player-progress-hotspot");
        if (!this.categoryTooltipContainer || !tooltipTextWrapper) return;

        if (biliChapterWrapper) {
            biliChapterWrapper.after(this.categoryTooltip);
        } else {
            tooltipTextWrapper.after(this.categoryTooltip);
        }

        const seekBar = document.querySelector(".bpx-player-progress-wrap");
        if (!seekBar) return;

        let mouseOnSeekBar = false;

        seekBar.addEventListener("mouseenter", () => {
            mouseOnSeekBar = true;
        });

        seekBar.addEventListener("mouseleave", () => {
            mouseOnSeekBar = false;
        });

        seekBar.addEventListener("mousemove", (e: MouseEvent) => {
            if (!mouseOnSeekBar || !this.categoryTooltip || !this.categoryTooltipContainer || !chrome.runtime?.id) return;

            const timeInSeconds = this.decimalToTime((e.clientX - seekBar.getBoundingClientRect().x) / seekBar.clientWidth);

            // Find the segment at that location, using the shortest if multiple found
            const mainSegment = this.getSmallestSegment(timeInSeconds, this.segments, "normal");
            this.setTooltipTitle(mainSegment, this.categoryTooltip);
        });
    }

    private setTooltipTitle(segment: PreviewBarSegment, tooltip: HTMLElement): void {
        if (segment) {
            const name = segment.description || shortCategoryName(segment.category);
            if (segment.unsubmitted) {
                tooltip.textContent = chrome.i18n.getMessage("unsubmitted") + " " + name;
            } else {
                tooltip.textContent = name;
            }

            tooltip.style.removeProperty("display");
        } else {
            tooltip.style.display = "none";
        }
    }

    /**
     * Insert the container of the preview bar into DOM,
     * as the first child node of parent
     */
    createElement(parent?: HTMLElement): void {
        if (parent) this.parent = parent;
        this.parent.prepend(this.container);
    }

    clear(): void {
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }

        if (this.customChaptersBar) this.customChaptersBar.style.display = "none";
        this.originalChapterBar?.style?.removeProperty("display");
        this.chapterVote?.setVisibility(false);

        document.querySelectorAll(`.sponsorBlockChapterBar`).forEach((e) => {
            if (e !== this.customChaptersBar) {
                e.remove();
            }
        });
    }

    set(segments: PreviewBarSegment[], videoDuration: number): void {
        this.segments = segments ?? [];
        this.videoDuration = videoDuration ?? 0;

        this.updateProgressBarElement();

        // TODO: find an api to varify video duration
        // Sometimes video duration is inaccurate, pull from accessibility info
        // const ariaDuration = parseInt(this.progressBar?.getAttribute('aria-valuemax')) ?? 0;
        // if (ariaDuration && Math.abs(ariaDuration - this.videoDuration) > 3) {
        //     this.videoDuration = ariaDuration;
        // }

        this.update();
    }

    private updateProgressBarElement(): void {
        const allProgressBars = document.querySelectorAll('.bpx-player-progress-schedule-wrap') as NodeListOf<HTMLElement>;
        this.progressBar = findValidElement(allProgressBars) ?? allProgressBars?.[0];
    }

    private update(): void {
        this.clear();

        const sortedSegments = this.segments.sort(({ segment: a }, { segment: b }) => {
            // Sort longer segments before short segments to make shorter segments render later
            return (b[1] - b[0]) - (a[1] - a[0]);
        });
        for (const segment of sortedSegments) {
            const bar = this.createBar(segment);
            this.container.appendChild(bar);
        }
    }

    /**
     * Takes a segment and create a <li></li> as preview bar
     */
    createBar(barSegment: PreviewBarSegment): HTMLLIElement {
        const { category, unsubmitted, segment, showLarger } = barSegment;

        const bar = document.createElement('li');
        bar.classList.add('previewbar');
        if (barSegment.requiredSegment) bar.classList.add("requiredSegment");
        if (barSegment.selectedSegment) bar.classList.add("selectedSegment");
        bar.innerHTML = showLarger ? '&nbsp;&nbsp;' : '&nbsp;';

        const fullCategoryName = (unsubmitted ? 'preview-' : '') + category;
        bar.setAttribute('sponsorblock-category', fullCategoryName);

        // Handled by setCategoryColorCSSVariables() of content.ts
        bar.style.backgroundColor = `var(--sb-category-${fullCategoryName})`;
        bar.style.opacity = Config.config.barTypes[fullCategoryName]?.opacity;

        bar.style.position = "absolute";
        const duration = Math.min(segment[1], this.videoDuration) - segment[0];
        const startTime = segment[1] ? Math.min(this.videoDuration, segment[0]) : segment[0];
        const endTime = Math.min(this.videoDuration, segment[1]);
        bar.style.left = this.timeToPercentage(startTime);

        if (duration > 0) {
            bar.style.right = this.timeToRightPercentage(endTime);
        }

        return bar;
    }

    updateChapterText(segments: SponsorTime[], submittingSegments: SponsorTime[], currentTime: number): SponsorTime[] {
        if (!Config.config.showSegmentNameInChapterBar
                || ((!segments || segments.length <= 0) && submittingSegments?.length <= 0)) {
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
            return segment.hidden === SponsorHideType.Visible
                && segment.segment[0] <= currentTime && segment.segment[1] > currentTime
                && segment.category !== DEFAULT_CATEGORY;
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
                    return (b.segment[0] - a.segment[0]);
                })[0];

                const chapterButton = this.getChapterButton(chaptersContainer);
                chapterButton.classList.remove("ytp-chapter-container-disabled");
                chapterButton.disabled = false;

                const chapterTitle = chaptersContainer.querySelector(".ytp-chapter-title-content") as HTMLDivElement;
                chapterTitle.style.display = "none";

                const chapterCustomText = (chapterTitle.parentElement.querySelector(".sponsorChapterText") || (() => {
                    const elem = document.createElement("div");
                    chapterTitle.parentElement.insertBefore(elem, chapterTitle);
                    elem.classList.add("sponsorChapterText");
                    return elem;
                })()) as HTMLDivElement;
                chapterCustomText.innerText = chosenSegment.description || shortCategoryName(chosenSegment.category);

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
        return (chaptersContainer ?? this.getChaptersContainer())
            ?.querySelector("button.ytp-chapter-title") as HTMLButtonElement;
    }

    remove(): void {
        this.container.remove();

        if (this.categoryTooltip) {
            this.categoryTooltip.remove();
            this.categoryTooltip = undefined;
        }

        if (this.categoryTooltipContainer) {
            this.categoryTooltipContainer.classList.remove(TOOLTIP_VISIBLE_CLASS);
            this.categoryTooltipContainer = undefined;
        }
    }

    intervalToPercentage(startTime: number, endTime: number) {
        return `${this.intervalToDecimal(startTime, endTime) * 100}%`;
    }

    intervalToDecimal(startTime: number, endTime: number) {
        return (this.timeToDecimal(endTime) - this.timeToDecimal(startTime));
    }

    timeToPercentage(time: number): string {
        return `${this.timeToDecimal(time) * 100}%`
    }

    timeToRightPercentage(time: number): string {
        return `${(1 - this.timeToDecimal(time)) * 100}%`
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
        if (this.originalChapterBarBlocks?.length > 1 && this.existingChapters.length === this.originalChapterBarBlocks?.length) {
            // Parent element to still work when display: none
            const totalPixels = this.originalChapterBar.parentElement.clientWidth;
            let pixelOffset = 0;
            let lastCheckedChapter = -1;
            for (let i = 0; i < this.originalChapterBarBlocks.length; i++) {
                const chapterElement = this.originalChapterBarBlocks[i];
                const widthPixels = parseFloat(chapterElement.style.width.replace("px", ""));

                const marginPixels = chapterElement.style.marginRight ? parseFloat(chapterElement.style.marginRight.replace("px", "")) : 0;
                if ((isTime && value >= this.existingChapters[i].segment[1])
                        || (!isTime && value >= (pixelOffset + widthPixels + marginPixels) / totalPixels)) {
                    pixelOffset += widthPixels + marginPixels;
                    lastCheckedChapter = i;
                } else {
                    break;
                }
            }

            // The next chapter is the one we are currently inside of
            const latestChapter = this.existingChapters[lastCheckedChapter + 1];
            if (latestChapter) {
                const latestWidth = parseFloat(this.originalChapterBarBlocks[lastCheckedChapter + 1].style.width.replace("px", ""));
                const latestChapterDuration = latestChapter.segment[1] - latestChapter.segment[0];

                if (isTime) {
                    const percentageInCurrentChapter = (value - latestChapter.segment[0]) / latestChapterDuration;
                    const sizeOfCurrentChapter = latestWidth / totalPixels;
                    return Math.min(1, ((pixelOffset / totalPixels) + (percentageInCurrentChapter * sizeOfCurrentChapter)));
                } else {
                    const percentageInCurrentChapter = (value * totalPixels - pixelOffset) / latestWidth;
                    return Math.max(0, latestChapter.segment[0] + (percentageInCurrentChapter * latestChapterDuration));
                }
            }
        }

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
    private getSmallestSegment(timeInSeconds: number, segments: PreviewBarSegment[], name?: string): PreviewBarSegment | null {
        const proposedIndex = name ? this.lastSmallestSegment[name]?.index : null;
        const startSearchIndex = proposedIndex && segments[proposedIndex] === this.lastSmallestSegment[name].segment ? proposedIndex : 0;
        const direction = startSearchIndex > 0 && timeInSeconds < this.lastSmallestSegment[name].segment.segment[0] ? -1 : 1;

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
                segment: segment
            };
        }

        return segment;
    }

    private getChapterChevron(): HTMLElement {
        return document.querySelector(".ytp-chapter-title-chevron");
    }
}

export default PreviewBar;
