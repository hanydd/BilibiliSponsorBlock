import * as React from "react";
import Config from "../../config";
import { VoteResponse } from "../../messageTypes";
import { ActionType, SegmentUUID, SponsorHideType, SponsorTime } from "../../types";
import { shortCategoryName } from "../../utils/categoryUtils";
import { getErrorMessage, getFormattedTime } from "../../utils/formating";
import { Spin } from "antd";

interface PopupSegmentProps {
    segment: SponsorTime;
    time: number;

    sendVoteMessage: (type: number, UUID: string) => Promise<VoteResponse>;
}

interface PopupSegmentState {
    isVoting: boolean;
    voteMessage: string;
}

class PopupSegment extends React.Component<PopupSegmentProps, PopupSegmentState> {
    constructor(props: PopupSegmentProps) {
        super(props);
        this.state = {
            isVoting: false,
            voteMessage: "",
        };
    }

    private extracInfo(): string {
        if (this.props.segment.hidden === SponsorHideType.Downvoted) {
            //this one is downvoted
            return " (" + chrome.i18n.getMessage("hiddenDueToDownvote") + ")";
        } else if (this.props.segment.hidden === SponsorHideType.MinimumDuration) {
            //this one is too short
            return " (" + chrome.i18n.getMessage("hiddenDueToDuration") + ")";
        } else if (this.props.segment.hidden === SponsorHideType.Hidden) {
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

    async vote(type: number, UUID: SegmentUUID) {
        this.startVoting();
        const response = await this.props.sendVoteMessage(type, UUID);
        console.log(response);

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
        this.stopVoting();
    }

    render(): React.ReactNode {
        const UUID = this.props.segment.UUID;
        const locked = this.props.segment.locked;
        const category = this.props.segment.category;
        const actionType = this.props.segment.actionType;
        const segment = this.props.segment.segment;

        return (
            <Spin spinning={this.state.isVoting} delay={10}>
                <details
                    id={"votingButtons" + UUID}
                    className="votingButtons"
                    data-uuid={UUID}
                    onToggle={(e) => {
                        console.log(e);
                        // if (votingButtons.open) {
                        //     openedUUIDs.push(UUID);
                        // } else {
                        //     const index = openedUUIDs.indexOf(UUID);
                        //     if (index !== -1) {
                        //         openedUUIDs.splice(openedUUIDs.indexOf(UUID), 1);
                        //     }
                        // }
                    }}
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
                                id={"sponsorTimesCategoryColorCircle" + UUID}
                                className="dot sponsorTimesCategoryColorCircle"
                                style={{ backgroundColor: Config.config.barTypes[category]?.color }}
                            ></span>
                            <span className="summaryLabel">{shortCategoryName(category) + this.extracInfo()}</span>
                        </div>
                        <div style={{ margin: "5px" }}>{this.segmentFromToTime()}</div>
                    </summary>

                    {this.state.isVoting || !!this.state.voteMessage ? (
                        <div id={"sponsorTimesVoteStatusContainer" + UUID} className="sponsorTimesVoteStatusContainer">
                            <div
                                id={"sponsorTimesThanksForVotingText" + UUID}
                                className="sponsorTimesThanksForVotingText"
                            >
                                {this.state.voteMessage}
                            </div>
                        </div>
                    ) : (
                        <div id="sponsorTimesVoteButtonsContainer" className="sbVoteButtonsContainer">
                            <img
                                id={"sponsorTimesUpvoteButtonsContainer" + UUID}
                                className="voteButton"
                                title={chrome.i18n.getMessage("upvote")}
                                src="/icons/thumbs_up.svg"
                                onClick={() => this.vote.bind(this)(1, UUID)}
                            ></img>
                            <img
                                id={"sponsorTimesDownvoteButtonsContainer" + UUID}
                                className="voteButton"
                                title={chrome.i18n.getMessage("downvote")}
                                src="/icons/thumbs_down_locked.svg"
                            ></img>
                            <img
                                id={"sponsorTimesCopyUUIDButtonContainer" + UUID}
                                className="voteButton"
                                src="/icons/clipboard.svg"
                                title={chrome.i18n.getMessage("copySegmentID")}
                            ></img>
                            <img
                                id={"sponsorTimesCopyUUIDButtonContainer" + UUID}
                                className="voteButton"
                                title={chrome.i18n.getMessage("hideSegment")}
                                src="/icons/visible.svg"
                            ></img>
                            <img
                                id={"sponsorTimesSkipButtonContainer" + UUID}
                                className="voteButton"
                                src="/icons/skip.svg"
                                title={chrome.i18n.getMessage("skipSegment")}
                            ></img>
                        </div>
                    )}
                </details>
            </Spin>
        );
    }
}

export default PopupSegment;
