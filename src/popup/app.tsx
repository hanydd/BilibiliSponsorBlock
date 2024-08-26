import { ConfigProvider, theme } from "antd";
import * as React from "react";
import Config from "../config";
import { showDonationLink } from "../config/configUtils";
import { Message } from "../messageTypes";
import { MessageHandler } from "../popup";
import { getFormattedHours } from "../utils/formating";
import VideoInfo from "./VideoInfo";

function app() {
    const cleanPopup = Config.config.cleanPopup;
    const isEmbed = window !== window.top;

    const messageHandler = new MessageHandler();

    function openOptionsAt(location: string) {
        chrome.runtime.sendMessage({ message: "openConfig", hash: location });
    }

    function sendTabMessage(data: Message, callback?) {
        messageHandler.query(
            {
                active: true,
                currentWindow: true,
            },
            (tabs) => {
                messageHandler.sendMessage(tabs[0].id, data, callback);
            }
        );
    }

    return (
        <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
            <div id="sponsorblockPopup" className="sponsorBlockPageBody sb-preload">
                <button
                    title={chrome.i18n.getMessage("closePopup")}
                    className={"sbCloseButton" + (isEmbed ? "" : " hidden")}
                    onClick={() => {
                        sendTabMessage({
                            message: "closePopup",
                        });
                    }}
                >
                    <img src="icons/close.png" width="15" height="15" alt="Close icon" />
                </button>

                <div
                    id="sbBetaServerWarning"
                    className={Config.config.testingServer ? "" : "hidden"}
                    title={chrome.i18n.getMessage("openOptionsPage")}
                    onClick={() => {
                        openOptionsAt("advanced");
                    }}
                >
                    {chrome.i18n.getMessage("betaServerWarning")}
                </div>

                <header id="sbPopupLogo" className={"sbPopupLogo" + (cleanPopup ? " hidden" : "")}>
                    <img
                        src="icons/IconSponsorBlocker256px.png"
                        alt="SponsorBlock"
                        width="40"
                        height="40"
                        id="sponsorBlockPopupLogo"
                    />
                    <p className="u-mZ">{chrome.i18n.getMessage("fullName")}</p>
                </header>

                <VideoInfo />

                {/* <!-- Toggle Box --> */}
                <div className="sbControlsMenu">
                    <label id="whitelistButton" htmlFor="whitelistToggle" className="hidden sbControlsMenu-item">
                        <input type="checkbox" style={{ display: "none" }} id="whitelistToggle" />
                        <svg
                            viewBox="0 0 24 24"
                            width="23"
                            height="23"
                            className="SBWhitelistIcon sbControlsMenu-itemIcon"
                        >
                            <path d="M24 10H14V0h-4v10H0v4h10v10h4V14h10z" />
                        </svg>
                        <span id="whitelistChannel">{chrome.i18n.getMessage("whitelistChannel")}</span>
                        <span id="unwhitelistChannel" style={{ display: "none" }}>
                            {chrome.i18n.getMessage("removeFromWhitelist")}
                        </span>
                    </label>
                    {/* <!--github: mbledkowski/toggle-switch--> */}
                    <label
                        id="disableExtension"
                        htmlFor="toggleSwitch"
                        className="toggleSwitchContainer sbControlsMenu-item"
                    >
                        <span className="toggleSwitchContainer-switch">
                            <input
                                type="checkbox"
                                style={{ display: "none" }}
                                id="toggleSwitch"
                                defaultChecked={true}
                            />
                            <span className="switchBg shadow"></span>
                            <span className="switchBg white"></span>
                            <span className="switchBg green"></span>
                            <span className="switchDot"></span>
                        </span>
                        <span id="disableSkipping">{chrome.i18n.getMessage("disableSkipping")}</span>
                        <span id="enableSkipping" style={{ display: "none" }}>
                            {chrome.i18n.getMessage("enableSkipping")}
                        </span>
                    </label>
                    <button
                        id="optionsButton"
                        className="sbControlsMenu-item"
                        title={chrome.i18n.getMessage("optionsInfo")}
                        onClick={() => {
                            openOptionsAt("behavior");
                        }}
                    >
                        <img
                            src="/icons/settings.svg"
                            alt="Settings icon"
                            width="23"
                            height="23"
                            className="sbControlsMenu-itemIcon"
                            id="sbPopupIconSettings"
                        />
                        {chrome.i18n.getMessage("Options")}
                    </button>
                </div>

                <a id="whitelistForceCheck" className="hidden">
                    {chrome.i18n.getMessage("forceChannelCheckPopup")}
                </a>

                {/* <!-- Submit box --> */}
                <div id="mainControls" style={{ display: "none" }} className={cleanPopup ? " hidden" : ""}>
                    <h1 className="sbHeader">{chrome.i18n.getMessage("recordTimesDescription")}</h1>
                    <sub className="sponsorStartHint grey-text">{chrome.i18n.getMessage("popupHint")}</sub>
                    <div style={{ textAlign: "center", margin: "8px 0" }}>
                        <button id="sponsorStart" className="sbMediumButton" style={{ marginRight: "8px" }}>
                            {chrome.i18n.getMessage("sponsorStart")}
                        </button>
                        <button id="submitTimes" className="sbMediumButton" style={{ display: "none" }}>
                            {chrome.i18n.getMessage("OpenSubmissionMenu")}
                        </button>
                    </div>
                    <span id="submissionHint" style={{ display: "none" }}>
                        {chrome.i18n.getMessage("submissionEditHint")}
                    </span>
                </div>

                {/* <!-- Your Work box --> */}
                <div id="sbYourWorkBox" className={"sbYourWorkBox" + (cleanPopup ? " hidden" : "")}>
                    <h1 className="sbHeader" style={{ padding: "8px 15px" }}>
                        {chrome.i18n.getMessage("yourWork")}
                    </h1>
                    <div className="sbYourWorkCols">
                        {/* <!-- Username --> */}
                        <div id="usernameElement">
                            <p className="u-mZ grey-text">
                                {chrome.i18n.getMessage("Username")}:{/* <!-- loading/errors --> */}
                                <span
                                    id="setUsernameStatus"
                                    className="u-mZ white-text"
                                    style={{ display: "none" }}
                                ></span>
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
                                <button id="copyUserID" title={chrome.i18n.getMessage("copyPublicID")}>
                                    <img
                                        src="/icons/clipboard.svg"
                                        alt={chrome.i18n.getMessage("copyPublicID")}
                                        width="16"
                                        height="16"
                                        id="sbPopupIconCopyUserID"
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
                                <span id="sponsorTimesOthersTimeSavedEndWord">
                                    {chrome.i18n.getMessage("minsLower")}
                                </span>
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

                <footer id="sbFooter" className={cleanPopup ? " hidden" : ""}>
                    <a id="helpButton">{chrome.i18n.getMessage("help")}</a>
                    <a href="https://bsbsb.top" target="_blank" rel="noopener noreferrer">
                        {chrome.i18n.getMessage("website")}
                    </a>
                    <a href="https://bsbsb.top/stats" target="_blank" rel="noopener noreferrer">
                        {chrome.i18n.getMessage("viewLeaderboard")}
                    </a>
                    <br />
                    <a href="https://github.com/hanydd/BilibiliSponsorBlock" target="_blank" rel="noopener noreferrer">
                        {chrome.i18n.getMessage("projectRepo")}
                    </a>
                    <a href="https://status.bsbsb.top" target="_blank" rel="noopener noreferrer">
                        {chrome.i18n.getMessage("serverStatus")}
                    </a>
                    {showDonationLink() && (
                        <a
                            href="https://bsbsb.top/donate/"
                            target="_blank"
                            rel="noopener noreferrer"
                            id="sbDonate"
                            onClick={() => {
                                Config.config.donateClicked += 1;
                            }}
                        >
                            {chrome.i18n.getMessage("Donate")}
                        </a>
                    )}
                </footer>

                {/* if the don't show notice again variable is true, an option to disable should be available */}
                <button id="showNoticeAgain" style={Config.config.dontShowNotice ? {} : { display: "none" }}>
                    {chrome.i18n.getMessage("showNotice")}
                </button>
            </div>
        </ConfigProvider>
    );
}

export default app;
