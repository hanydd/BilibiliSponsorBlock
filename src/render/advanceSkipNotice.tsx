import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { ContentContainer, SponsorTime, NoticeVisbilityMode } from "../types";

import Config from "../config";
import Utils from "../utils";
import SkipNoticeComponent from "../components/SkipNoticeComponent";
import { SkipNoticeAction } from "../utils/noticeUtils";
const utils = new Utils();

class advanceSkipNotices {
    segments: SponsorTime[];
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    noticeElement: HTMLDivElement;

    advanceSkipNoticeRef: React.MutableRefObject<SkipNoticeComponent>;
    root: Root;

    closed = false;

    constructor(
        segments: SponsorTime[],
        contentContainer: ContentContainer,
        unskipTime: number,
        autoSkip: boolean,
    ) {
        this.advanceSkipNoticeRef = React.createRef();

        this.segments = segments;
        this.contentContainer = contentContainer;

        const referenceNode = utils.findReferenceNode();

        this.noticeElement = document.createElement("div");
        this.noticeElement.className = "sponsorSkipNoticeContainer";

        referenceNode.prepend(this.noticeElement);

        this.root = createRoot(this.noticeElement);
        this.root.render(
            <SkipNoticeComponent
                segments={segments}
                autoSkip={autoSkip}
                advanceSkipNotice={true}
                contentContainer={contentContainer}
                ref={this.advanceSkipNoticeRef}
                closeListener={() => this.close()}
                smaller={
                    Config.config.noticeVisibilityMode >= NoticeVisbilityMode.MiniForAll ||
                    (Config.config.noticeVisibilityMode >= NoticeVisbilityMode.MiniForAutoSkip && autoSkip)
                }
                fadeIn={true}
                fadeOut={false}
                unskipTime={unskipTime}
                advanceSkipNoticeShow={true}
                 />
        );
    }
    
    setShowKeybindHint(value: boolean): void {
        this.advanceSkipNoticeRef?.current?.setState({
            showKeybindHint: value,
        });
    }

    close(): void {
        this.root.unmount();
        this.noticeElement.remove();

        this.closed = true;
    }

    sameNotice(segments: SponsorTime[]): boolean {
        if (segments.length !== this.segments.length) return false;

        for (let i = 0; i < segments.length; i++) {
            if (segments[i].UUID !== this.segments[i].UUID) return false;
        }

        return true;
    }

    toggleSkip(): void {
        this.advanceSkipNoticeRef?.current?.prepAction(SkipNoticeAction.Unskip0);
    }

    unmutedListener(time: number): void {
        this.advanceSkipNoticeRef?.current?.unmutedListener(time);
    }
}

export default advanceSkipNotices;
