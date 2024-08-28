import { ReloadOutlined } from "@ant-design/icons";
import * as React from "react";
import Config from "../config";
import { Message, RefreshSegmentsResponse } from "../messageTypes";

interface VideoInfoProps {
    getSegmentsFromContentScript: (update: boolean) => void;
    sendTabMessageAsync: (data: Message) => Promise<unknown>;
}

interface VideoInfoState {
    loading: boolean;
    videoFound: boolean;
    loadedMessage: string;
}

class VideoInfo extends React.Component<VideoInfoProps, VideoInfoState> {
    constructor(props: VideoInfoProps) {
        super(props);
        this.state = {
            loading: true,
            videoFound: false,
            loadedMessage: chrome.i18n.getMessage("sponsorFound"),
        };
    }

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
                <p id="videoFound" className="u-mZ grey-text">
                    {this.computeIndicatorText()}
                </p>

                <button
                    id="refreshSegmentsButton"
                    title={chrome.i18n.getMessage("refreshSegments")}
                    onClick={this.refreshSegments.bind(this)}
                >
                    <ReloadOutlined spin={this.state.loading} style={{ fontSize: 16, padding: 2 }} />
                </button>
                {/* <!-- Video Segments --> */}
                <div id="issueReporterContainer">
                    {/* <div id="issueReporterTabs" className="hidden">
                        <span
                            id="issueReporterTabSegments"
                            className="sbSelected"
                            onClick={(e) => {
                                console.log(e);
                                // PageElements.issueReporterTabSegments.classList.add("sbSelected");
                                this.props.getSegmentsFromContentScript(true);
                            }}
                        >
                            <span>{chrome.i18n.getMessage("SegmentsCap")}</span>
                        </span>
                    </div> */}
                    <div id="issueReporterTimeButtons"></div>
                    <div id="issueReporterImportExport" className={this.state.videoFound ? "" : "hidden"}>
                        <div id="importExportButtons">
                            <button id="importSegmentsButton" title={chrome.i18n.getMessage("importSegments")}>
                                <img src="/icons/import.svg" alt="Refresh icon" id="importSegments" />
                            </button>
                            <button
                                id="exportSegmentsButton"
                                className="hidden"
                                title={chrome.i18n.getMessage("exportSegments")}
                            >
                                <img src="/icons/export.svg" alt="Export icon" id="exportSegments" />
                            </button>
                        </div>

                        <span id="importSegmentsMenu" className="hidden">
                            <textarea id="importSegmentsText" rows={5} style={{ width: "50px" }}></textarea>

                            <button id="importSegmentsSubmit" title={chrome.i18n.getMessage("importSegments")}>
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
