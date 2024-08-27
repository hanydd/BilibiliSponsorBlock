import { ConfigProvider, theme } from "antd";
import * as React from "react";
import Config from "../config";
import { showDonationLink } from "../config/configUtils";
import { Message } from "../messageTypes";
import { MessageHandler } from "../popup";
import { getFormattedHours } from "../utils/formating";
import VideoInfo from "./VideoInfo";
import ControlMenu from "./ControlMenu";

function app() {
    const cleanPopup = Config.config.cleanPopup;
    const isEmbed = window !== window.top;

    const messageHandler = new MessageHandler();

    // Forward click events
    if (isEmbed) {
        document.addEventListener("keydown", (e) => {
            const target = e.target as HTMLElement;
            if (
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                e.key === "ArrowUp" ||
                e.key === "ArrowDown"
            ) {
                return;
            }

            if (e.key === " ") {
                // No scrolling
                e.preventDefault();
            }

            sendTabMessage({
                message: "keydown",
                key: e.key,
                keyCode: e.keyCode,
                code: e.code,
                which: e.which,
                shiftKey: e.shiftKey,
                ctrlKey: e.ctrlKey,
                altKey: e.altKey,
                metaKey: e.metaKey,
            });
        });
    }

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

                <ControlMenu openOptionsAt={openOptionsAt} />

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
                    <a id="helpButton" onClick={() => chrome.runtime.sendMessage({ message: "openHelp" })}>
                        {chrome.i18n.getMessage("help")}
                    </a>
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
