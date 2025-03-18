import { ConfigProvider, message, theme } from "antd";
import * as React from "react";
import Config from "../config";
import { StorageChangesObject } from "../config/config";
import { IsChannelWhitelistedResponse, IsInfoFoundMessageResponse, Message, PopupMessage } from "../messageTypes";
import { NewVideoID, PortVideo, SponsorTime } from "../types";
import { waitFor } from "../utils/index";
import ControlMenu from "./ControlMenu";
import PopupFooter from "./PopupFooter";
import { MessageHandler } from "./PopupMessageHandler";
import { PortVideoSection } from "./PortVideoSection";
import SubmitBox from "./SubmitBox";
import UserWork from "./UserWork";
import VideoInfo from "./VideoInfo/VideoInfo";

function app() {
    const videoInfoRef = React.createRef<VideoInfo>();
    const controlMenuRef = React.createRef<ControlMenu>();
    const portVideoRef = React.createRef<PortVideoSection>();
    const submitBoxRef = React.createRef<SubmitBox>();

    const [messageApi, messageContextHolder] = message.useMessage();

    const isEmbed = window !== window.top;

    const messageHandler = new MessageHandler();
    let port: chrome.runtime.Port = null;

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
        await waitFor(() => Config.config !== null, 5000, 10);
        updateUnsubmittedSegments();

        messageHandler.sendMessage(tabs[0].id, { message: "isInfoFound", updating }, infoFound);
    }

    function getSegmentsFromContentScript(updating: boolean): void {
        messageHandler.query({ active: true, currentWindow: true }, (tabs) => onTabs(tabs, updating));
    }

    async function infoFound(request: IsInfoFoundMessageResponse) {
        // End any loading animation
        videoInfoRef.current.stopLoading();

        if (chrome.runtime.lastError || request.found == undefined) {
            // This page doesn't have the injected content script, or at least not yet
            // or if request is undefined, then the page currently being browsed is not Bilibili
            displayNoVideo();
            return;
        }

        // show control menus
        submitBoxRef.current?.showSubmitBox();
        controlMenuRef.current.setState({ hasVideo: true });

        displayDownloadedSponsorTimes(request.sponsorTimes ?? [], request.time);
        displayPortVideo(request.portVideo);
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

        // update whitelist status
        const response = (await sendTabMessageAsync({
            message: "isChannelWhitelisted",
        })) as IsChannelWhitelistedResponse;
        controlMenuRef.current.setState({ hasWhiteListed: response.value });
    }

    //display the video times from the array at the top, in a different section
    function displayDownloadedSponsorTimes(sponsorTimes: SponsorTime[], time: number) {
        videoInfoRef.current.displayDownloadedSponsorTimes(sponsorTimes, time);
    }

    function displayPortVideo(portVideo: PortVideo) {
        portVideoRef.current?.setPortVideo(portVideo);
    }

    /** this is not a Bilibili video page */
    function displayNoVideo() {
        videoInfoRef.current.displayNoVideo();
        submitBoxRef.current?.hideSubmitBox();
        portVideoRef.current?.displayNoVideo();
    }

    /** Update Unsubmitted Segments when Config changes */
    function updateUnsubmittedSegments() {
        submitBoxRef.current?.updateUnsubmittedSegments();
    }

    function setCurrentVideoID(videoID: NewVideoID) {
        submitBoxRef.current?.setState({ currentVideoID: videoID });
    }

    function startLoadingAnimation() {
        videoInfoRef.current.startLoading();
    }

    function updateCurrentTime(currentTime: number) {
        videoInfoRef.current.setState({ currentTime: currentTime });
    }

    function copyToClipboard(text: string): void {
        if (!isEmbed) {
            window.navigator.clipboard.writeText(text);
        } else {
            sendTabMessage({
                message: "copyToClipboard",
                text,
            });
        }
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

    // TODO: the method is never triggered. Because the listener is not listening changes of child properties.
    function contentConfigUpdateListener(changes: StorageChangesObject) {
        for (const key in changes) {
            switch (key) {
                case "unsubmittedSegments":
                    updateUnsubmittedSegments();
                    break;
            }
        }
    }

    function setupComPort(): void {
        port = chrome.runtime.connect({ name: "popup" });
        port.onDisconnect.addListener(() => setupComPort());
        port.onMessage.addListener((msg) => onMessage(msg));
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
                updateUnsubmittedSegments();
                controlMenuRef.current.setState({ hasWhiteListed: msg.whitelisted });

                // Clear segments list & start loading animation
                // We'll get a ping once they're loaded
                startLoadingAnimation();
                displayDownloadedSponsorTimes([], 0);
                displayPortVideo(null);
                break;
        }
    }

    return (
        <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
            {messageContextHolder}
            <div id="sponsorblockPopup" className="sponsorBlockPageBody sb-preload">
                <button
                    title={chrome.i18n.getMessage("closePopup")}
                    className={"sbCloseButton" + (isEmbed ? "" : " hidden")}
                    onClick={() => sendTabMessage({ message: "closePopup" })}
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
                    <header className={"sbPopupLogo"}>
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
                    messageApi={messageApi}
                    sendTabMessage={sendTabMessage}
                    sendTabMessageAsync={sendTabMessageAsync}
                    copyToClipboard={copyToClipboard}
                />

                <ControlMenu
                    ref={controlMenuRef}
                    messageApi={messageApi}
                    openOptionsAt={openOptionsAt}
                    sendTabMessage={sendTabMessage}
                    sendTabMessageAsync={sendTabMessageAsync}
                />

                <PortVideoSection
                    ref={portVideoRef}
                    messageApi={messageApi}
                    sendTabMessage={sendTabMessage}
                    sendTabMessageAsync={sendTabMessageAsync}
                />

                {/* <!-- Submit box --> */}
                {!Config.config.cleanPopup && (
                    <>
                        <SubmitBox
                            ref={submitBoxRef}
                            sendTabMessage={sendTabMessage}
                            sendTabMessageAsync={sendTabMessageAsync}
                        />

                        <UserWork messageApi={messageApi} copyToClipboard={copyToClipboard} />

                        <PopupFooter />
                    </>
                )}
            </div>
        </ConfigProvider>
    );
}

export default app;
