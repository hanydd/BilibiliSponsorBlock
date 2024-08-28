import * as React from "react";
import Config from "../config";
import { getFormattedHours } from "../utils/formating";
import { getHash } from "../utils/hash";

interface UserWorkProps {
    copyToClipboard: (text: string) => void;
}

interface UserWorkState {}

class UserWork extends React.Component<UserWorkProps, UserWorkState> {
    render(): React.ReactNode {
        return (
            <div id="sbYourWorkBox" className={"sbYourWorkBox"}>
                <h1 className="sbHeader" style={{ padding: "8px 15px" }}>
                    {chrome.i18n.getMessage("yourWork")}
                </h1>
                <div className="sbYourWorkCols">
                    {/* <!-- Username --> */}
                    <div id="usernameElement">
                        <p className="u-mZ grey-text">
                            {chrome.i18n.getMessage("Username")}:{/* <!-- loading/errors --> */}
                            <span id="setUsernameStatus" className="u-mZ white-text" style={{ display: "none" }}></span>
                        </p>
                        <div id="setUsernameContainer">
                            <p id="usernameValue"></p>
                            <button id="setUsernameButton" title={chrome.i18n.getMessage("setUsername")}>
                                <img
                                    src="/icons/pencil.svg"
                                    alt={chrome.i18n.getMessage("setUsername")}
                                    width="16"
                                    height="16"
                                    id="sbPopupIconEdit"
                                />
                            </button>
                            <button
                                id="copyUserID"
                                title={chrome.i18n.getMessage("copyPublicID")}
                                onClick={async () => this.props.copyToClipboard(await getHash(Config.config.userID))}
                            >
                                <img
                                    src="/icons/clipboard.svg"
                                    alt={chrome.i18n.getMessage("copyPublicID")}
                                    width="16"
                                    height="16"
                                />
                            </button>
                        </div>
                        <div id="setUsername" style={{ display: "none" }}>
                            <input id="usernameInput" placeholder="Username" />
                            <button id="submitUsername">
                                <img
                                    src="/icons/check.svg"
                                    alt={chrome.i18n.getMessage("setUsername")}
                                    width="16"
                                    height="16"
                                    id="sbPopupIconCheck"
                                />
                            </button>
                        </div>
                    </div>
                    {/* <!-- Submissions --> */}
                    <div id="sponsorTimesContributionsContainer" className="hidden">
                        <p className="u-mZ grey-text">{chrome.i18n.getMessage("Submissions")}:</p>
                        <p id="sponsorTimesContributionsDisplay" className="u-mZ">
                            0
                        </p>
                    </div>
                </div>

                <p id="sponsorTimesViewsContainer" style={{ display: "none" }} className="u-mZ sbStatsSentence">
                    {chrome.i18n.getMessage("savedPeopleFrom")}
                    <b>
                        <span id="sponsorTimesViewsDisplay">0</span>
                    </b>
                    <span id="sponsorTimesViewsDisplayEndWord">{chrome.i18n.getMessage("Segments")}</span>
                    <br />
                    <span className="sbExtraInfo">
                        (
                        <b>
                            <span id="sponsorTimesOthersTimeSavedDisplay">0</span>
                            <span id="sponsorTimesOthersTimeSavedEndWord">{chrome.i18n.getMessage("minsLower")}</span>
                        </b>
                        <span>{chrome.i18n.getMessage("youHaveSavedTimeEnd")}</span>)
                    </span>
                </p>
                <p
                    style={{ display: Config.config.skipCount != undefined ? "block" : "none" }}
                    className="u-mZ sbStatsSentence"
                >
                    {chrome.i18n.getMessage("youHaveSkipped")}
                    <b>
                        &nbsp;
                        <span>{Config.config.skipCount.toLocaleString()}</span>
                        &nbsp;
                    </b>
                    <span>{chrome.i18n.getMessage("Segments")}</span>
                    <span className="sbExtraInfo">
                        （
                        <b>
                            {getFormattedHours(Config.config.minutesSaved)}
                            {chrome.i18n.getMessage("minsLower")}
                        </b>
                        ）
                    </span>
                </p>
            </div>
        );
    }
}

export default UserWork;
