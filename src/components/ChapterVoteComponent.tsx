import * as React from "react";
import Config from "../config";
import { Category, SegmentUUID, SponsorTime } from "../types";

import { VoteResponse } from "../messageTypes";
import { Tooltip } from "../render/Tooltip";
import ThumbsDownSvg from "../svg-icons/thumbs_down_svg";
import ThumbsUpSvg from "../svg-icons/thumbs_up_svg";
import { AnimationUtils } from "../utils/animationUtils";
import { getErrorMessage } from "../utils/formating";
import { downvoteButtonColor, SkipNoticeAction } from "../utils/noticeUtils";
import { showMessage } from "../render/MessageNotice";

export interface ChapterVoteProps {
    vote: (type: number, UUID: SegmentUUID, category?: Category) => Promise<VoteResponse>;
    size?: string;
}

export interface ChapterVoteState {
    segment?: SponsorTime;
    show: boolean;
    size?: string;
}

class ChapterVoteComponent extends React.Component<ChapterVoteProps, ChapterVoteState> {
    tooltip?: Tooltip;

    constructor(props: ChapterVoteProps) {
        super(props);

        this.state = {
            segment: null,
            show: false,
            size: props.size ?? "22px",
        };
    }

    render(): React.ReactElement {
        if (this.tooltip && !this.state.show) {
            this.tooltip.close();
            this.tooltip = null;
        }

        return (
            <>
                {/* Upvote Button */}
                <button
                    id={"sponsorTimesDownvoteButtonsContainerUpvoteChapter"}
                    className={"playerButton sbPlayerUpvote ytp-button " + (!this.state.show ? "sbhidden" : "")}
                    draggable="false"
                    title={chrome.i18n.getMessage("upvoteButtonInfo")}
                    onClick={(e) => this.vote(e, 1)}
                >
                    <ThumbsUpSvg
                        className="playerButtonImage"
                        fill={Config.config.colorPalette.white}
                        width={this.state.size}
                        height={this.state.size}
                    />
                </button>

                {/* Downvote Button */}
                <button
                    id={"sponsorTimesDownvoteButtonsContainerDownvoteChapter"}
                    className={"playerButton sbPlayerDownvote ytp-button " + (!this.state.show ? "sbhidden" : "")}
                    draggable="false"
                    title={chrome.i18n.getMessage("reportButtonInfo")}
                    onClick={(e) => {
                        if (this.tooltip) {
                            this.tooltip.close();
                            this.tooltip = null;
                        } else {
                            this.vote(e, 0, e.target as HTMLElement);
                        }
                    }}
                >
                    <ThumbsDownSvg
                        className="playerButtonImage"
                        fill={downvoteButtonColor(
                            this.state.segment ? [this.state.segment] : null,
                            SkipNoticeAction.Downvote,
                            SkipNoticeAction.Downvote
                        )}
                        width={this.state.size}
                        height={this.state.size}
                    />
                </button>
            </>
        );
    }

    private async vote(event: React.MouseEvent, type: number, element?: HTMLElement): Promise<void> {
        event.stopPropagation();
        if (this.state.segment) {
            const stopAnimation = AnimationUtils.applyLoadingAnimation(
                element ?? (event.currentTarget as HTMLElement),
                0.3
            );

            const response = await this.props.vote(type, this.state.segment.UUID);
            await stopAnimation();

            if (response.successType == 1 || (response.successType == -1 && response.statusCode == 429)) {
                this.setState({
                    show: type === 1,
                });
            } else if (response.statusCode !== 403) {
                showMessage(getErrorMessage(response.statusCode, response.responseText), "error");
            }
        }
    }
}

export default ChapterVoteComponent;
