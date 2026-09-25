import { StyleProvider } from "@ant-design/cssinjs";
import { ConfigProvider, message, theme } from "antd";
import * as React from "react";
import Config from "../config";
import { StorageChangesObject } from "../config/config";
import { IsChannelWhitelistedResponse, IsInfoFoundMessageResponse, Message, PageLogsResponse, PopupMessage } from "../messageTypes";
import { NewVideoID, PortVideo, SponsorTime } from "../types";
import { waitFor } from "../utils/index";
import { assetUrl } from "./assetUrl";
import ControlMenu from "./ControlMenu";
import PopupFooter from "./PopupFooter";
import { MessageHandler, MessageListener } from "./PopupMessageHandler";
import { PortVideoSection } from "./PortVideoSection";
import SubmitBox from "./SubmitBox";
import UserWork from "./UserWork";
import VideoInfo from "./VideoInfo/VideoInfo";

interface PopupAppProps {
    embedded?: boolean;
    messageListener?: MessageListener;
    styleContainer?: Element | ShadowRoot;
    keyboardEventTarget?: EventTarget;
}

function app({ embedded, messageListener, styleContainer, keyboardEventTarget }: PopupAppProps = {}) {
    const videoInfoRef = React.createRef<VideoInfo>();
    const controlMenuRef = React.createRef<ControlMenu>();
    const portVideoRef = React.createRef<PortVideoSection>();
    const submitBoxRef = React.createRef<SubmitBox>();

    const [messageApi, messageContextHolder] = message.useMessage();

    const isEmbed = embedded ?? window !== window.top;

    const messageHandler = new MessageHandler(messageListener);
    const portRef = React.useRef<chrome.runtime.Port>(null);
    const reconnectPortRef = React.useRef(true);

    React.useEffect(() => {
        if (!isEmbed) {
            return () => undefined;
        }

        const target = keyboardEventTarget ?? document;
        const keydownListener = (e: KeyboardEvent) => {
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
        };

        target.addEventListener("keydown", keydownListener as EventListener);
        return () => target.removeEventListener("keydown", keydownListener as EventListener);
    }, [isEmbed, keyboardEventTarget]);

    React.useEffect(() => {
        getSegmentsFromContentScript(false);

        if (!Config.configSyncListeners.includes(contentConfigUpdateListener)) {
            Config.configSyncListeners.push(contentConfigUpdateListener);
        }

        setupComPort();

        return () => {
            reconnectPortRef.current = false;
            portRef.current?.disconnect();
            portRef.current = null;

            const listenerIndex = Config.configSyncListeners.indexOf(contentConfigUpdateListener);
            if (listenerIndex !== -1) {
                Config.configSyncListeners.splice(listenerIndex, 1);
            }
        };
    }, []);

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

    async function copyPageLogs(): Promise<void> {
        const response = (await sendTabMessageAsync({ message: "getLogs" })) as PageLogsResponse;
        if (!response?.page) {
            messageApi.error(chrome.i18n.getMessage("copyPageLogsFailed"));
            return;
        }

        const exportPayload = {
            exportedAt: new Date().toISOString(),
            extensionVersion: chrome.runtime.getManifest().version,
            page: response.page,
            counts: response.counts,
            lifecycleSummary: response.lifecycleSummary,
            logs: response.logs,
        };

        copyToClipboard(JSON.stringify(exportPayload, null, 2));
        messageApi.success(chrome.i18n.getMessage("copyPageLogsSuccess"));
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
        const port = chrome.runtime.connect({ name: "popup" });
        portRef.current = port;
        port.onDisconnect.addListener(() => {
            if (reconnectPortRef.current) {
                setupComPort();
            }
        });
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

    const popup = (
        <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
            {messageContextHolder}
            <div id="sponsorblockPopup" className="sponsorBlockPageBody sb-preload">
                <button
                    title={chrome.i18n.getMessage("closePopup")}
                    className={"sbCloseButton" + (isEmbed ? "" : " hidden")}
                    onClick={() => sendTabMessage({ message: "closePopup" })}
                >
                    <img src={assetUrl("icons/close.png")} width="15" height="15" alt="Close icon" />
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
                            src={assetUrl("icons/IconSponsorBlocker256px.png")}
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

                        <PopupFooter copyPageLogs={copyPageLogs} />
                    </>
                )}
            </div>
        </ConfigProvider>
    );

    return styleContainer ? <StyleProvider container={styleContainer}>{popup}</StyleProvider> : popup;
}

export default app;
