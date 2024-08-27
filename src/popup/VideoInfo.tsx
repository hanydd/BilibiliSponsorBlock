import * as React from "react";
import Config from "../config";

interface VideoInfoProps {
    getSegmentsFromContentScript: (update: boolean) => void;
}

interface VideoInfoState {
    loading: boolean;
}

class VideoInfo extends React.Component<VideoInfoProps> {
    constructor(props: VideoInfoProps) {
        super(props);
        this.state = {
            loading: true,
        };
    }

    render() {
        return (
            <div style={Config.config.cleanPopup ? { marginTop: 10 } : {}}>
                {/* <!-- Loading text --> */}
                <p id="loadingIndicator" className="u-mZ grey-text">
                    {chrome.i18n.getMessage("noVideoID")}
                </p>
                {/* <!-- If the video was found in the database --> */}
                <p id="videoFound" className="u-mZ grey-text"></p>
                <button id="refreshSegmentsButton" title={chrome.i18n.getMessage("refreshSegments")}>
                    <img src="/icons/refresh.svg" alt="Refresh icon" id="refreshSegments" />
                </button>
                {/* <!-- Video Segments --> */}
                <div id="issueReporterContainer">
                    <div id="issueReporterTabs" className="hidden">
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
                    </div>
                    <div id="issueReporterTimeButtons"></div>
                    <div id="issueReporterImportExport" className="hidden">
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
