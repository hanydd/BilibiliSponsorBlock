import { ConfigProvider, theme } from "antd";
import * as React from "react";
import Config from "../config";
import { StorageChangesObject } from "../config/config";
import { showDonationLink } from "../config/configUtils";
import { IsChannelWhitelistedResponse, IsInfoFoundMessageResponse, Message, PopupMessage } from "../messageTypes";
import { MessageHandler } from "../popup";
import { SponsorTime, VideoID } from "../types";
import { getFormattedHours } from "../utils/formating";
import { waitFor } from "../utils/index";
import ControlMenu from "./ControlMenu";
import VideoInfo from "./VideoInfo";

function app() {
    const videoInfoRef = React.createRef<VideoInfo>();
    const controlMenuRef = React.createRef<ControlMenu>();
    const mainControlsRef = React.createRef<HTMLDivElement>();

    const isEmbed = window !== window.top;

    const messageHandler = new MessageHandler();
    let port: chrome.runtime.Port = null;

    //the start and end time pairs (2d)
    let sponsorTimes: SponsorTime[] = [];
    let downloadedTimes: SponsorTime[] = [];
    function setSponsorTimes(times: SponsorTime[]) {
        sponsorTimes = times;
    }
    function setDownloadedTimes(times: SponsorTime[]) {
        downloadedTimes = times;
    }
    // const [sponsorTimes, setSponsorTimes] = React.useState<SponsorTime[]>([]);
    // const [downloadedTimes, setDownloadedTimes] = React.useState<SponsorTime[]>([]);

    //current video ID of this tab
    let currentVideoID = null;
    function setCurrentVideoID(videoID: VideoID) {
        currentVideoID = videoID;
    }
    // const [currentVideoID, setCurrentVideoID] = React.useState<VideoID>(null);

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

    getSegmentsFromContentScript(false);

    if (!Config.configSyncListeners.includes(contentConfigUpdateListener)) {
        Config.configSyncListeners.push(contentConfigUpdateListener);
    }

    setupComPort();

    // For loading video info from the page
    let loadRetryCount = 0;
    function onTabs(tabs, updating: boolean): void {
        messageHandler.sendMessage(tabs[0].id, { message: "getVideoID" }, function (result) {
            console.log("getVideoID", result);
            if (result !== undefined && result.videoID) {
                setCurrentVideoID(result.videoID);

                loadTabData(tabs, updating);
            } else {
                // Handle error if it exists
                chrome.runtime.lastError;

                // This isn't a Bilibili video then, or at least the content script is not loaded
                displayNoVideo();

                // Try again in some time if a failure
                loadRetryCount++;
                if (loadRetryCount < 6) {
                    setTimeout(() => getSegmentsFromContentScript(false), 100 * loadRetryCount);
                }
            }
        });
    }

    async function loadTabData(tabs, updating: boolean): Promise<void> {
        if (!currentVideoID) {
            //this isn't a Bilibili video then
            displayNoVideo();
            return;
        }

        await waitFor(() => Config.config !== null, 5000, 10);
        setSponsorTimes(Config.local.unsubmittedSegments[currentVideoID] ?? []);
        updateSegmentEditingUI();

        messageHandler.sendMessage(tabs[0].id, { message: "isInfoFound", updating }, infoFound);
    }

    function getSegmentsFromContentScript(updating: boolean): void {
        messageHandler.query(
            {
                active: true,
                currentWindow: true,
            },
            (tabs) => onTabs(tabs, updating)
        );
    }

    async function infoFound(request: IsInfoFoundMessageResponse) {
        console.log("info found", request);
        // End any loading animation
        videoInfoRef.current.stopLoading();

        if (chrome.runtime.lastError || request.found == undefined) {
            // This page doesn't have the injected content script, or at least not yet
            // or if request is undefined, then the page currently being browsed is not Bilibili
            displayNoVideo();
            return;
        }

        //remove loading text
        mainControlsRef.current.style.display = "block";
        controlMenuRef.current.setState({ hasVideo: true });

        setDownloadedTimes(request.sponsorTimes ?? []);
        displayDownloadedSponsorTimes(downloadedTimes, request.time);
        if (request.found) {
            videoInfoRef.current.displayVideoWithMessage();
        } else if (request.status == 404 || request.status == 200) {
            videoInfoRef.current.displayVideoWithMessage(chrome.i18n.getMessage("sponsor404"));
        } else {
            if (request.status) {
                videoInfoRef.current.displayVideoWithMessage(
                    chrome.i18n.getMessage("connectionError") + request.status
                );
            } else {
                videoInfoRef.current.displayVideoWithMessage(chrome.i18n.getMessage("segmentsStillLoading"));
            }
        }

        // see if whitelist button should be swapped
        const response = (await sendTabMessageAsync({
            message: "isChannelWhitelisted",
        })) as IsChannelWhitelistedResponse;
        controlMenuRef.current.setState({ hasWhiteListed: response.value });
        // PageElements.whitelistToggle.checked = true;
    }

    //display the video times from the array at the top, in a different section
    function displayDownloadedSponsorTimes(sponsorTimes: SponsorTime[], time: number) {
        console.log("displayDownloadedSponsorTimes", sponsorTimes, time);
    }

    //this is not a Bilibili video page
    function displayNoVideo() {
        videoInfoRef.current.displayNoVideo();
        // PageElements.issueReporterTabs.classList.add("hidden");
    }

    /** Updates any UI related to segment editing and submission according to the current state. */
    function updateSegmentEditingUI() {
        console.log("updateSegmentEditingUI", sponsorTimes);
        // PageElements.sponsorStart.innerText = chrome.i18n.getMessage(
        //     isCreatingSegment() ? "sponsorEnd" : "sponsorStart"
        // );

        // PageElements.submitTimes.style.display = sponsorTimes && sponsorTimes.length > 0 ? "unset" : "none";
        // PageElements.submissionHint.style.display = sponsorTimes && sponsorTimes.length > 0 ? "unset" : "none";
    }

    function startLoadingAnimation() {
        videoInfoRef.current.startLoading();
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

    function sendTabMessageAsync(data: Message): Promise<unknown> {
        return new Promise((resolve) => sendTabMessage(data, (response) => resolve(response)));
    }

    function contentConfigUpdateListener(changes: StorageChangesObject) {
        for (const key in changes) {
            switch (key) {
                case "unsubmittedSegments":
                    setSponsorTimes(Config.local.unsubmittedSegments[currentVideoID] ?? []);
                    updateSegmentEditingUI();
                    break;
            }
        }
    }

    function setupComPort(): void {
        port = chrome.runtime.connect({ name: "popup" });
        port.onDisconnect.addListener(() => setupComPort());
        port.onMessage.addListener((msg) => onMessage(msg));
    }

    function updateCurrentTime(currentTime: number) {
        // Create a map of segment UUID -> segment object for easy access
        const segmentMap: Record<string, SponsorTime> = {};
        for (const segment of downloadedTimes) segmentMap[segment.UUID] = segment;

        // Iterate over segment elements and update their classes
        const segmentList = document.getElementById("issueReporterTimeButtons");
        for (const segmentElement of segmentList.children) {
            const UUID = segmentElement.getAttribute("data-uuid");
            if (UUID == null || segmentMap[UUID] == undefined) continue;

            const summaryElement = segmentElement.querySelector("summary");
            if (summaryElement == null) continue;

            const segment = segmentMap[UUID];
            summaryElement.classList.remove("segmentActive", "segmentPassed");
            if (currentTime >= segment.segment[0]) {
                if (currentTime < segment.segment[1]) {
                    summaryElement.classList.add("segmentActive");
                } else {
                    summaryElement.classList.add("segmentPassed");
                }
            }
        }
    }

    function onMessage(msg: PopupMessage) {
        switch (msg.message) {
            case "time":
                updateCurrentTime(msg.time);
                break;
            case "infoUpdated":
                infoFound(msg);
                break;
            case "videoChanged":
                setCurrentVideoID(msg.videoID);
                setSponsorTimes(Config.local.unsubmittedSegments[currentVideoID] ?? []);
                updateSegmentEditingUI();

                if (msg.whitelisted) {
                    controlMenuRef.current.setState({ hasWhiteListed: true });
                }

                // Clear segments list & start loading animation
                // We'll get a ping once they're loaded
                startLoadingAnimation();
                displayDownloadedSponsorTimes([], 0);
                break;
        }
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

                {Config.config.testingServer && (
                    <div
                        id="sbBetaServerWarning"
                        title={chrome.i18n.getMessage("openOptionsPage")}
                        onClick={() => openOptionsAt("advanced")}
                    >
                        {chrome.i18n.getMessage("betaServerWarning")}
                    </div>
                )}

                {!Config.config.cleanPopup && (
                    <header id="sbPopupLogo" className={"sbPopupLogo"}>
                        <img
                            src="icons/IconSponsorBlocker256px.png"
                            alt="SponsorBlock"
                            width="40"
                            height="40"
                            id="sponsorBlockPopupLogo"
                        />
                        <p className="u-mZ">{chrome.i18n.getMessage("fullName")}</p>
                    </header>
                )}

                <VideoInfo
                    ref={videoInfoRef}
                    getSegmentsFromContentScript={getSegmentsFromContentScript}
                    sendTabMessageAsync={sendTabMessageAsync}
                />

                <ControlMenu
                    ref={controlMenuRef}
                    openOptionsAt={openOptionsAt}
                    sendTabMessage={sendTabMessage}
                    sendTabMessageAsync={sendTabMessageAsync}
                />

                {/* <!-- Submit box --> */}
                {!Config.config.cleanPopup && (
                    <>
                        <div ref={mainControlsRef} id="mainControls" style={{ display: "none" }}>
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
                        <div id="sbYourWorkBox" className={"sbYourWorkBox"}>
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

                            <p
                                id="sponsorTimesViewsContainer"
                                style={{ display: "none" }}
                                className="u-mZ sbStatsSentence"
                            >
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

                        <footer id="sbFooter">
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
                            <a
                                href="https://github.com/hanydd/BilibiliSponsorBlock"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
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
                    </>
                )}

                {/* if the don't show notice again variable is true, an option to disable should be available */}
                <button
                    style={Config.config.dontShowNotice ? {} : { display: "none" }}
                    onClick={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                        Config.config.dontShowNotice = false;
                    }}
                >
                    {chrome.i18n.getMessage("showNotice")}
                </button>
            </div>
        </ConfigProvider>
    );
}

export default app;
