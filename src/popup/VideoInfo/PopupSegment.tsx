import { Spin } from "antd";
import * as React from "react";
import Config from "../../config";
import { Message, VoteResponse } from "../../messageTypes";
import { ActionType, SegmentUUID, SponsorHideType, SponsorTime } from "../../types";
import { shortCategoryName } from "../../utils/categoryUtils";
import { getErrorMessage, getFormattedTime } from "../../utils/formating";
import { MessageInstance } from "antd/es/message/interface";

interface PopupSegmentProps {
    segment: SponsorTime;
    time: number;

    messageApi: MessageInstance;

    sendTabMessage: (data: Message, callback?) => void;
    sendTabMessageAsync: (data: Message) => Promise<unknown>;
    copyToClipboard: (text: string) => void;
}

interface PopupSegmentState {
    isVoting: boolean;
    voteMessage: string;
    hidden: SponsorHideType;
}

class PopupSegment extends React.Component<PopupSegmentProps, PopupSegmentState> {
    constructor(props: PopupSegmentProps) {
        super(props);
        this.state = {
            isVoting: false,
            voteMessage: "",
            hidden: props.segment.hidden,
        };
    }

    private extracInfo(): string {
        if (this.state.hidden === SponsorHideType.Downvoted) {
            //this one is downvoted
            return " (" + chrome.i18n.getMessage("hiddenDueToDownvote") + ")";
        } else if (this.state.hidden === SponsorHideType.MinimumDuration) {
            //this one is too short
            return " (" + chrome.i18n.getMessage("hiddenDueToDuration") + ")";
        } else if (this.state.hidden === SponsorHideType.Hidden) {
            return " (" + chrome.i18n.getMessage("manuallyHidden") + ")";
        }
        return "";
    }

    private segmentFromToTime(): string {
        if (this.props.segment.actionType === ActionType.Full) {
            return chrome.i18n.getMessage("full");
        } else {
            return (
                getFormattedTime(this.props.segment.segment[0], true) +
                (this.props.segment.actionType !== ActionType.Poi
                    ? " " + chrome.i18n.getMessage("to") + " " + getFormattedTime(this.props.segment.segment[1], true)
                    : "")
            );
        }
    }

    private showSkipButton(): boolean {
        return (
            this.props.segment.actionType === ActionType.Skip ||
            this.props.segment.actionType === ActionType.Mute ||
            (this.props.segment.actionType === ActionType.Poi &&
                [SponsorHideType.Visible, SponsorHideType.Hidden].includes(this.state.hidden))
        );
    }

    private showHideButton(): boolean {
        return this.props.segment.actionType !== ActionType.Full;
    }

    startVoting() {
        this.setState({ isVoting: true });
    }
    stopVoting() {
        this.setState({ isVoting: false });
    }

    setVoteMessage(message: string) {
        this.setState({ voteMessage: message });
    }

    removeVoteMessage() {
        this.setState({ voteMessage: "" });
    }

    private copyUUID() {
        try {
            this.props.copyToClipboard(this.props.segment.UUID);
            this.props.messageApi.success(chrome.i18n.getMessage("CopiedExclamation"));
        } catch (e) {
            this.props.messageApi.error(e);
        }
    }

    async vote(type: number, UUID: SegmentUUID) {
        this.startVoting();
        const response = (await this.props.sendTabMessageAsync({
            message: "submitVote",
            type: type,
            UUID: UUID,
        })) as VoteResponse;
        this.stopVoting();

        if (response != undefined) {
            // see if it was a success or failure
            if (response.successType == 1 || (response.successType == -1 && response.statusCode == 429)) {
                //success (treat rate limits as a success)
                this.setVoteMessage(chrome.i18n.getMessage("voted"));
            } else if (response.successType == -1) {
                this.setVoteMessage(getErrorMessage(response.statusCode, response.responseText));
            }
            setTimeout(() => this.removeVoteMessage(), 1500);
        }
    }

    private skipSegment(): void {
        this.props.sendTabMessage({
            message: "reskip",
            UUID: this.props.segment.UUID,
        });
    }

    private selectSegment(UUID: SegmentUUID | null): void {
        this.props.sendTabMessage({
            message: "selectSegment",
            UUID: UUID,
        });
    }

    render(): React.ReactNode {
        const UUID = this.props.segment.UUID;
        const locked = this.props.segment.locked;
        const category = this.props.segment.category;
        const segment = this.props.segment.segment;

        return (
            <Spin spinning={this.state.isVoting} delay={10}>
                <details
                    className="votingButtons"
                    data-uuid={UUID}
                    onMouseEnter={() => this.selectSegment(this.props.segment.UUID)}
                    onMouseLeave={() => this.selectSegment(null)}
                >
                    <summary
                        className={
                            "segmentSummary" +
                            (this.props.time >= segment[0]
                                ? this.props.time < segment[0]
                                    ? " segmentActive"
                                    : " segmentPassed"
                                : "")
                        }
                    >
                        <div>
                            <span
                                className="dot sponsorTimesCategoryColorCircle"
                                style={{ backgroundColor: Config.config.barTypes[category]?.color }}
                            ></span>
                            <span className="summaryLabel">{shortCategoryName(category) + this.extracInfo()}</span>
                        </div>
                        <div style={{ margin: "5px" }}>{this.segmentFromToTime()}</div>
                    </summary>

                    {this.state.voteMessage ? (
                        <div className="sponsorTimesVoteStatusContainer">
                            <div className="sponsorTimesThanksForVotingText">{this.state.voteMessage}</div>
                        </div>
                    ) : (
                        <div className="sbVoteButtonsContainer">
                            <img
                                className="voteButton"
                                title={chrome.i18n.getMessage("upvote")}
                                src="/icons/thumbs_up.svg"
                                onClick={() => this.vote.bind(this)(1, UUID)}
                            ></img>

                            <img
                                className="voteButton"
                                title={chrome.i18n.getMessage("downvote")}
                                src={
                                    locked && Config.config.isVip
                                        ? "icons/thumbs_down_locked.svg"
                                        : "icons/thumbs_down.svg"
                                }
                                onClick={() => this.vote.bind(this)(0, UUID)}
                            ></img>

                            <img
                                className="voteButton"
                                src="/icons/clipboard.svg"
                                title={chrome.i18n.getMessage("copySegmentID")}
                                onClick={this.copyUUID.bind(this)}
                            ></img>

                            {this.showHideButton() && (
                                <img
                                    className="voteButton"
                                    title={chrome.i18n.getMessage("hideSegment")}
                                    src={
                                        this.state.hidden === SponsorHideType.Hidden
                                            ? "icons/not_visible.svg"
                                            : "/icons/visible.svg"
                                    }
                                    onClick={() => {
                                        if (this.state.hidden === SponsorHideType.Hidden) {
                                            this.props.segment.hidden = SponsorHideType.Visible;
                                        } else {
                                            this.props.segment.hidden = SponsorHideType.Hidden;
                                        }
                                        this.setState({ hidden: this.props.segment.hidden });

                                        this.props.sendTabMessage({
                                            message: "hideSegment",
                                            type: this.props.segment.hidden,
                                            UUID: UUID,
                                        });
                                    }}
                                ></img>
                            )}

                            {this.showSkipButton() && (
                                <img
                                    className="voteButton"
                                    src="/icons/skip.svg"
                                    title={chrome.i18n.getMessage("skipSegment")}
                                    onClick={this.skipSegment.bind(this)}
                                ></img>
                            )}
                        </div>
                    )}
                </details>
            </Spin>
        );
    }
}

export default PopupSegment;
