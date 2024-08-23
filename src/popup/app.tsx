import * as React from "react";

function app() {
    return (
        <div id="sponsorblockPopup" className="sponsorBlockPageBody sb-preload">
            <button id="sbCloseButton" title="__MSG_closePopup__" className="sbCloseButton hidden">
                <img src="icons/close.png" width="15" height="15" alt="Close icon" />
            </button>

            <div id="sbBetaServerWarning" className="hidden" title="__MSG_openOptionsPage__">
                __MSG_betaServerWarning__
            </div>

            <header id="sbPopupLogo" className="sbPopupLogo">
                <img
                    src="icons/IconSponsorBlocker256px.png"
                    alt="SponsorBlock"
                    width="40"
                    height="40"
                    id="sponsorBlockPopupLogo"
                />
                <p className="u-mZ">__MSG_fullName__</p>
            </header>

            <div id="videoInfo">
                {/* <!-- Loading text --> */}
                <p id="loadingIndicator" className="u-mZ grey-text">
                    __MSG_noVideoID__
                </p>
                {/* <!-- If the video was found in the database --> */}
                <p id="videoFound" className="u-mZ grey-text"></p>
                <button id="refreshSegmentsButton" title="__MSG_refreshSegments__">
                    <img src="/icons/refresh.svg" alt="Refresh icon" id="refreshSegments" />
                </button>
                {/* <!-- Video Segments --> */}
                <div id="issueReporterContainer">
                    <div id="issueReporterTabs" className="hidden">
                        <span id="issueReporterTabSegments" className="sbSelected">
                            <span>__MSG_SegmentsCap__</span>
                        </span>
                    </div>
                    <div id="issueReporterTimeButtons"></div>
                    <div id="issueReporterImportExport" className="hidden">
                        <div id="importExportButtons">
                            <button id="importSegmentsButton" title="__MSG_importSegments__">
                                <img src="/icons/import.svg" alt="Refresh icon" id="importSegments" />
                            </button>
                            <button id="exportSegmentsButton" className="hidden" title="__MSG_exportSegments__">
                                <img src="/icons/export.svg" alt="Export icon" id="exportSegments" />
                            </button>
                        </div>

                        <span id="importSegmentsMenu" className="hidden">
                            <textarea id="importSegmentsText" rows={5} style={{ width: "50px" }}></textarea>

                            <button id="importSegmentsSubmit" title="__MSG_importSegments__">
                                __MSG_Import__
                            </button>
                        </span>
                    </div>
                </div>
            </div>

            {/* <!-- Toggle Box --> */}
            <div className="sbControlsMenu">
                <label id="whitelistButton" htmlFor="whitelistToggle" className="hidden sbControlsMenu-item">
                    <input type="checkbox" style={{ display: "none" }} id="whitelistToggle" />
                    <svg viewBox="0 0 24 24" width="23" height="23" className="SBWhitelistIcon sbControlsMenu-itemIcon">
                        <path d="M24 10H14V0h-4v10H0v4h10v10h4V14h10z" />
                    </svg>
                    <span id="whitelistChannel">__MSG_whitelistChannel__</span>
                    <span id="unwhitelistChannel" style={{ display: "none" }}>
                        __MSG_removeFromWhitelist__
                    </span>
                </label>
                {/* <!--github: mbledkowski/toggle-switch--> */}
                <label
                    id="disableExtension"
                    htmlFor="toggleSwitch"
                    className="toggleSwitchContainer sbControlsMenu-item"
                >
                    <span className="toggleSwitchContainer-switch">
                        <input type="checkbox" style={{ display: "none" }} id="toggleSwitch" checked />
                        <span className="switchBg shadow"></span>
                        <span className="switchBg white"></span>
                        <span className="switchBg green"></span>
                        <span className="switchDot"></span>
                    </span>
                    <span id="disableSkipping">__MSG_disableSkipping__</span>
                    <span id="enableSkipping" style={{ display: "none" }}>
                        __MSG_enableSkipping__
                    </span>
                </label>
                <button id="optionsButton" className="sbControlsMenu-item" title="__MSG_optionsInfo__">
                    <img
                        src="/icons/settings.svg"
                        alt="Settings icon"
                        width="23"
                        height="23"
                        className="sbControlsMenu-itemIcon"
                        id="sbPopupIconSettings"
                    />
                    __MSG_Options__
                </button>
            </div>

            <a id="whitelistForceCheck" className="hidden">
                __MSG_forceChannelCheckPopup__
            </a>

            {/* <!-- Submit box --> */}
            <div id="mainControls" style={{ display: "none" }}>
                <h1 className="sbHeader">__MSG_recordTimesDescription__</h1>
                <sub className="sponsorStartHint grey-text">__MSG_popupHint__</sub>
                <div style={{ textAlign: "center", margin: "8px 0" }}>
                    <button id="sponsorStart" className="sbMediumButton" style={{ marginRight: "8px" }}>
                        __MSG_sponsorStart__
                    </button>
                    <button id="submitTimes" className="sbMediumButton" style={{ display: "none" }}>
                        __MSG_OpenSubmissionMenu__
                    </button>
                </div>
                <span id="submissionHint" style={{ display: "none" }}>
                    __MSG_submissionEditHint__
                </span>
            </div>

            {/* <!-- Your Work box --> */}
            <div id="sbYourWorkBox" className="sbYourWorkBox">
                <h1 className="sbHeader" style={{ padding: "8px 15px" }}>
                    __MSG_yourWork__
                </h1>
                <div className="sbYourWorkCols">
                    {/* <!-- Username --> */}
                    <div id="usernameElement">
                        <p className="u-mZ grey-text">
                            __MSG_Username__:
                            {/* <!-- loading/errors --> */}
                            <span id="setUsernameStatus" className="u-mZ white-text" style={{ display: "none" }}></span>
                        </p>
                        <div id="setUsernameContainer">
                            <p id="usernameValue"></p>
                            <button id="setUsernameButton" title="__MSG_setUsername__">
                                <img
                                    src="/icons/pencil.svg"
                                    alt="__MSG_setUsername__"
                                    width="16"
                                    height="16"
                                    id="sbPopupIconEdit"
                                />
                            </button>
                            <button id="copyUserID" title="__MSG_copyPublicID__">
                                <img
                                    src="/icons/clipboard.svg"
                                    alt="__MSG_copyPublicID__"
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
                                    alt="__MSG_setUsername__"
                                    width="16"
                                    height="16"
                                    id="sbPopupIconCheck"
                                />
                            </button>
                        </div>
                    </div>
                    {/* <!-- Submissions --> */}
                    <div id="sponsorTimesContributionsContainer" className="hidden">
                        <p className="u-mZ grey-text">__MSG_Submissions__:</p>
                        <p id="sponsorTimesContributionsDisplay" className="u-mZ">
                            0
                        </p>
                    </div>
                </div>

                <p id="sponsorTimesViewsContainer" style={{ display: "none" }} className="u-mZ sbStatsSentence">
                    __MSG_savedPeopleFrom__
                    <b>
                        <span id="sponsorTimesViewsDisplay">0</span>
                    </b>
                    <span id="sponsorTimesViewsDisplayEndWord">__MSG_Segments__</span>
                    <br />
                    <span className="sbExtraInfo">
                        (
                        <b>
                            <span id="sponsorTimesOthersTimeSavedDisplay">0</span>
                            <span id="sponsorTimesOthersTimeSavedEndWord">__MSG_minsLower__</span>
                        </b>
                        <span>__MSG_youHaveSavedTimeEnd__</span>)
                    </span>
                </p>
                <p id="sponsorTimesSkipsDoneContainer" style={{ display: "none" }} className="u-mZ sbStatsSentence">
                    __MSG_youHaveSkipped__
                    <b>
                        <span id="sponsorTimesSkipsDoneDisplay">0</span>
                    </b>
                    <span id="sponsorTimesSkipsDoneEndWord">__MSG_Segments__</span>
                    <span className="sbExtraInfo">
                        (
                        <b>
                            <span id="sponsorTimeSavedDisplay">0</span>
                            <span id="sponsorTimeSavedEndWord">__MSG_minsLower__</span>
                        </b>
                        )
                    </span>
                </p>
            </div>

            <footer id="sbFooter">
                <a id="helpButton">__MSG_help__</a>
                <a href="https://bsbsb.top" target="_blank" rel="noopener noreferrer">
                    __MSG_website__
                </a>
                <a href="https://bsbsb.top/stats" target="_blank" rel="noopener noreferrer">
                    __MSG_viewLeaderboard__
                </a>
                <br />
                <a href="https://github.com/hanydd/BilibiliSponsorBlock" target="_blank" rel="noopener noreferrer">
                    __MSG_projectRepo__
                </a>
                <a href="https://status.bsbsb.top" target="_blank" rel="noopener noreferrer">
                    __MSG_serverStatus__
                </a>
                <a href="https://bsbsb.top/donate/" target="_blank" rel="noopener noreferrer" id="sbDonate">
                    __MSG_Donate__
                </a>
            </footer>

            <button id="showNoticeAgain" style={{ display: "none" }}>
                __MSG_showNotice__
            </button>
        </div>
    );
}

export default app;
