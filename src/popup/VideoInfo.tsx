import { ReloadOutlined } from "@ant-design/icons";
import * as React from "react";
import Config from "../config";
import { Message, RefreshSegmentsResponse } from "../messageTypes";
import GenericNotice from "../render/GenericNotice";
import { SponsorTime } from "../types";
import { exportTimes } from "../utils/exporter";

interface VideoInfoProps {
    downloadedTimes: SponsorTime[];

    sendTabMessage: (data: Message, callback?) => void;
    sendTabMessageAsync: (data: Message) => Promise<unknown>;
    copyToClipboard: (text: string) => void;
}

interface VideoInfoState {
    loading: boolean;
    videoFound: boolean;
    loadedMessage: string;

    importInputOpen: boolean;
    showExport: boolean;
}

class VideoInfo extends React.Component<VideoInfoProps, VideoInfoState> {
    constructor(props: VideoInfoProps) {
        super(props);
        this.state = {
            loading: true,
            videoFound: false,
            loadedMessage: chrome.i18n.getMessage("sponsorFound"),
            importInputOpen: false,
            showExport: false,
        };
    }

    private importTextRef = React.createRef<HTMLTextAreaElement>();

    startLoading() {
        this.setState({ loading: true });
    }

    stopLoading() {
        this.setState({ loading: false });
    }

    displayNoVideo() {
        // 无法找到视频，不是播放页面
        this.setState({ loading: false, videoFound: false });
    }

    displayVideoWithMessage(message: string = chrome.i18n.getMessage("sponsorFound")) {
        // 可以找到视频ID
        this.setState({ loading: false, videoFound: true, loadedMessage: message });
    }

    async refreshSegments() {
        this.startLoading();
        const response = (await this.props.sendTabMessageAsync({
            message: "refreshSegments",
        })) as RefreshSegmentsResponse;

        console.log("Refresh Response", response);

        if (response == null || !response.hasVideo) {
            this.displayNoVideo();
        }
    }

    toggleImportInput() {
        this.setState({ importInputOpen: !this.state.importInputOpen });
    }

    async importSegments() {
        const text = this.importTextRef.current.value;

        this.props.sendTabMessage({
            message: "importSegments",
            data: text,
        });

        this.setState({ importInputOpen: false });
    }

    exportSegments() {
        this.props.copyToClipboard(exportTimes(this.props.downloadedTimes));

        // const stopAnimation = AnimationUtils.applyLoadingAnimation(PageElements.exportSegmentsButton, 0.3);
        // stopAnimation();
        new GenericNotice(null, "exportCopied", {
            title: chrome.i18n.getMessage(`CopiedExclamation`),
            timed: true,
            maxCountdownTime: () => 0.6,
            referenceNode: document.getElementById("exportSegmentsButton").parentElement,
            dontPauseCountdown: true,
            style: {
                top: 0,
                bottom: 0,
                minWidth: 0,
                right: "30px",
                margin: "auto",
                height: "max-content",
            },
            hideLogo: true,
            hideRightInfo: true,
        });
    }

    private computeIndicatorText(): string {
        if (this.state.loading) {
            return chrome.i18n.getMessage("Loading");
        }
        if (this.state.videoFound) {
            return this.state.loadedMessage;
        } else {
            return chrome.i18n.getMessage("noVideoID");
        }
    }

    render() {
        return (
            <div style={Config.config.cleanPopup ? { marginTop: 10 } : {}}>
                {/* <!-- Loading text --> */}
                <p className="u-mZ grey-text">{this.computeIndicatorText()}</p>

                <button
                    id="refreshSegmentsButton"
                    title={chrome.i18n.getMessage("refreshSegments")}
                    onClick={this.refreshSegments.bind(this)}
                >
                    <ReloadOutlined spin={this.state.loading} style={{ fontSize: 16, padding: 2 }} />
                </button>
                {/* <!-- Video Segments --> */}
                <div id="issueReporterContainer">
                    <div id="issueReporterTimeButtons"></div>
                    <div id="issueReporterImportExport" className={this.state.videoFound ? "" : "hidden"}>
                        <div>
                            <button
                                title={chrome.i18n.getMessage("importSegments")}
                                onClick={this.toggleImportInput.bind(this)}
                            >
                                <img src="/icons/import.svg" alt="Import icon" />
                            </button>
                            {this.state.showExport && (
                                <button
                                    title={chrome.i18n.getMessage("exportSegments")}
                                    onClick={this.exportSegments.bind(this)}
                                >
                                    <img src="/icons/export.svg" alt="Export icon" />
                                </button>
                            )}
                        </div>

                        <span id="importSegmentsMenu" className={this.state.importInputOpen ? "" : "hidden"}>
                            <textarea ref={this.importTextRef} id="importSegmentsText" rows={5}></textarea>
                            <button
                                title={chrome.i18n.getMessage("importSegments")}
                                onClick={this.importSegments.bind(this)}
                            >
                                {chrome.i18n.getMessage("Import")}
                            </button>
                        </span>
                    </div>
                </div>
            </div>
        );
    }
}

export default VideoInfo;
