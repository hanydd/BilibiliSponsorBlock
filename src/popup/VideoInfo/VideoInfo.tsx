import { ReloadOutlined } from "@ant-design/icons";
import { MessageInstance } from "antd/es/message/interface";
import * as React from "react";
import Config from "../../config";
import { Message, RefreshSegmentsResponse } from "../../messageTypes";
import { SponsorTime } from "../../types";
import { exportTimes } from "../../utils/exporter";
import PopupSegment from "./PopupSegment";

interface VideoInfoProps {
    messageApi: MessageInstance;
    sendTabMessage: (data: Message, callback?) => void;
    sendTabMessageAsync: (data: Message) => Promise<unknown>;
    copyToClipboard: (text: string) => void;
}

interface VideoInfoState {
    loading: boolean;
    videoFound: boolean;
    loadedMessage: string;

    importInputOpen: boolean;

    downloadedTimes: SponsorTime[];
    currentTime: number;
}

class VideoInfo extends React.Component<VideoInfoProps, VideoInfoState> {
    constructor(props: VideoInfoProps) {
        super(props);
        this.state = {
            loading: true,
            videoFound: false,
            loadedMessage: chrome.i18n.getMessage("sponsorFound"),
            importInputOpen: false,

            downloadedTimes: [],
            currentTime: 0,
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

        if (response == null || !response.hasVideo) {
            this.displayNoVideo();
        }
    }

    private showExport() {
        return this.state.downloadedTimes?.length > 0;
    }

    private toggleImportInput() {
        this.setState({ importInputOpen: !this.state.importInputOpen });
    }

    private async importSegments() {
        const text = this.importTextRef.current.value;

        this.props.sendTabMessage({
            message: "importSegments",
            data: text,
        });

        this.setState({ importInputOpen: false });
    }

    private exportSegments() {
        this.props.copyToClipboard(exportTimes(this.state.downloadedTimes));
        this.props.messageApi.success(chrome.i18n.getMessage(`CopiedExclamation`));
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

    //display the video times from the array at the top, in a different section
    displayDownloadedSponsorTimes(sponsorTimes: SponsorTime[], time: number) {
        // Sort list by start time
        const downloadedTimes = sponsorTimes
            .sort((a, b) => a.segment[1] - b.segment[1])
            .sort((a, b) => a.segment[0] - b.segment[0]);

        this.setState({ downloadedTimes: downloadedTimes, currentTime: time });
    }

    private SegmentList(): React.ReactNode[] {
        return this.state.downloadedTimes.map((seg) => (
            <PopupSegment
                segment={seg}
                time={this.state.currentTime}
                key={seg.UUID}
                messageApi={this.props.messageApi}
                sendTabMessage={this.props.sendTabMessage}
                sendTabMessageAsync={this.props.sendTabMessageAsync}
                copyToClipboard={this.props.copyToClipboard}
            ></PopupSegment>
        ));
    }

    render() {
        return (
            <div style={Config.config.cleanPopup ? { marginTop: 20 } : {}}>
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
                    <div id="issueReporterTimeButtons">{this.SegmentList()}</div>
                    <div id="issueReporterImportExport" className={this.state.videoFound ? "" : "hidden"}>
                        <div>
                            <button
                                title={chrome.i18n.getMessage("importSegments")}
                                onClick={this.toggleImportInput.bind(this)}
                            >
                                <img src="/icons/import.svg" alt="Import icon" />
                            </button>
                            {this.showExport() && (
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
