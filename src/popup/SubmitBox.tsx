import * as React from "react";
import Config from "../config";
import { Message } from "../messageTypes";
import { SponsorTime, VideoID } from "../types";
import { getUnsubmittedSegmentKey } from "../config/configUtils";

interface SubmitBoxProps {
    sendTabMessage: (data: Message, callback?) => void;
    sendTabMessageAsync: (data: Message) => Promise<unknown>;
}

interface SubmitBoxState {
    unsubmittedSegments: Record<string, SponsorTime[]>;
    currentVideoID: VideoID;

    showSubmitBox: boolean;
}

class SubmitBox extends React.Component<SubmitBoxProps, SubmitBoxState> {
    constructor(props: SubmitBoxProps) {
        super(props);
        this.state = {
            unsubmittedSegments: Config.local.unsubmittedSegments,
            currentVideoID: null,

            showSubmitBox: false,
        };
    }

    private sponsorTimes(): SponsorTime[] {
        return this.state.unsubmittedSegments[getUnsubmittedSegmentKey(this.state.currentVideoID)] || [];
    }

    private isCreatingSegment(): boolean {
        const segments = this.state.unsubmittedSegments[getUnsubmittedSegmentKey(this.state.currentVideoID)];
        if (!segments) return false;
        const lastSegment = segments[segments.length - 1];
        return lastSegment && lastSegment?.segment?.length !== 2;
    }

    private hasSponsorTimes(): boolean {
        return this.sponsorTimes().length > 0;
    }

    showSubmitBox() {
        this.setState({ showSubmitBox: true });
    }

    hideSubmitBox() {
        this.setState({ showSubmitBox: false });
    }

    /** Updates any UI related to segment editing and submission according to the current state. */
    updateUnsubmittedSegments() {
        this.setState({ unsubmittedSegments: Config.local.unsubmittedSegments });
    }

    async sendSponsorStartMessage() {
        //the content script will get the message if a Bilibili page is open
        await this.props.sendTabMessageAsync({
            from: "popup",
            message: "sponsorStart",
        });
        this.startSponsorCallback();

        // Perform a second update after the config changes take effect as a workaround for a race condition
        const removeListener = (listener: typeof lateUpdate) => {
            const index = Config.configSyncListeners.indexOf(listener);
            if (index !== -1) Config.configSyncListeners.splice(index, 1);
        };

        const lateUpdate = () => {
            this.startSponsorCallback();
            removeListener(lateUpdate);
        };

        Config.configSyncListeners.push(lateUpdate);

        // Remove the listener after 200ms in case the changes were propagated by the time we got the response
        setTimeout(() => removeListener(lateUpdate), 200);
    }

    startSponsorCallback() {
        this.updateUnsubmittedSegments();
    }

    render() {
        return (
            <div id="mainControls" style={{ display: this.state.showSubmitBox ? "block" : "none" }}>
                <h1 className="sbHeader">{chrome.i18n.getMessage("recordTimesDescription")}</h1>
                <sub className="sponsorStartHint grey-text">{chrome.i18n.getMessage("popupHint")}</sub>

                <div style={{ textAlign: "center", margin: "8px 0" }}>
                    <button
                        className="sbMediumButton"
                        style={{ marginRight: "8px" }}
                        onClick={this.sendSponsorStartMessage.bind(this)}
                    >
                        {chrome.i18n.getMessage(this.isCreatingSegment() ? "sponsorEnd" : "sponsorStart")}
                    </button>

                    {this.hasSponsorTimes() && (
                        <button
                            id="submitTimes"
                            className="sbMediumButton"
                            onClick={() => this.props.sendTabMessage({ message: "submitTimes" })}
                        >
                            {chrome.i18n.getMessage("OpenSubmissionMenu")}
                        </button>
                    )}
                </div>

                {this.hasSponsorTimes() && <span>{chrome.i18n.getMessage("submissionEditHint")}</span>}
            </div>
        );
    }
}

export default SubmitBox;
