import { LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";
import { MessageInstance } from "antd/es/message/interface";
import * as React from "react";
import { Message } from "../messageTypes";
import { PortVideo } from "../types";
import { parseYoutubeID } from "../utils/parseVideoID";
import { RefreshIcon } from "../components/icon/refresh";
import Config from "../config";

interface PortVideoProps {
    messageApi: MessageInstance;
    sendTabMessage: (data: Message, callback?) => void;
    sendTabMessageAsync: (data: Message) => Promise<unknown>;
}

interface PortVideoState {
    show: boolean;
    loading: boolean;
    portVideo: PortVideo;
}

export class PortVideoSection extends React.Component<PortVideoProps, PortVideoState> {
    constructor(props: PortVideoProps) {
        super(props);
        this.state = {
            show: false,
            loading: true,
            portVideo: null,
        };
        this.displayNoVideo = this.displayNoVideo.bind(this);
        this.setPortVideo = this.setPortVideo.bind(this);
        this.submitPortVideo = this.submitPortVideo.bind(this);
        this.vote = this.vote.bind(this);
        this.updatePortedSegments = this.updatePortedSegments.bind(this);
    }

    private inputRef = React.createRef<HTMLInputElement>();

    displayNoVideo(): void {
        this.setState({ portVideo: null, show: false, loading: false });
    }

    setPortVideo(portVideo: PortVideo): void {
        this.setState({ portVideo, show: true, loading: false });
    }

    private hasPortVideo(): boolean {
        return !!this.state.portVideo?.UUID;
    }

    getVideoLink(): string {
        return `https://www.youtube.com/watch?v=${this.state.portVideo.ytbID}`;
    }

    private async submitPortVideo(): Promise<void> {
        const YtbInput = this.inputRef.current.value;
        if (!YtbInput) {
            return;
        }
        const ytbID = parseYoutubeID(YtbInput);
        if (!ytbID) {
            this.props.messageApi.warning("YouTube视频ID有误");
            return;
        }
        this.setState({ loading: true });

        try {
            await this.props.sendTabMessageAsync({ message: "submitPortVideo", ytbID: ytbID });
        } catch (e) {
            this.props.messageApi.error(e.getMessage());
        }
    }

    private async vote(vote: number): Promise<void> {
        this.setState({ loading: true });
        await this.props.sendTabMessageAsync({
            message: "votePortVideo",
            vote: vote,
            bvid: this.state.portVideo.bvID,
            UUID: this.state.portVideo.UUID,
        });
    }

    private async updatePortedSegments(): Promise<void> {
        await this.props.sendTabMessageAsync({
            message: "updatePortedSegments",
            UUID: this.state.portVideo.UUID,
        });
    }

    render() {
        if (!this.state.show || !Config.config.showPortVideoButton) {
            return <></>;
        }
        return (
            <div className="portVideoBox">
                <h1 className="sbHeader">{chrome.i18n.getMessage("bindPortVideo")}</h1>
                <Spin indicator={<LoadingOutlined spin />} delay={100} spinning={this.state.loading}>
                    <div className="portVideoSection">
                        {this.hasPortVideo() ? (
                            <>
                                <span style={{ color: "var(--sb-grey-fg-color)" }}>
                                    {chrome.i18n.getMessage("hasBoundPortVideo")}
                                </span>
                                <a style={{ paddingRight: "12px" }} href={this.getVideoLink()} target="blank">
                                    {this.state.portVideo.ytbID}
                                </a>

                                <img
                                    className="voteButton"
                                    title={chrome.i18n.getMessage("upvote")}
                                    src={chrome.runtime.getURL("icons/thumbs_up.svg")}
                                    onClick={() => this.vote(1)}
                                ></img>
                                <img
                                    className="voteButton"
                                    title={chrome.i18n.getMessage("downvote")}
                                    src={chrome.runtime.getURL("icons/thumbs_down.svg")}
                                    onClick={() => this.vote(0)}
                                ></img>
                                <div
                                    className="voteButton"
                                    title={chrome.i18n.getMessage("refreshPortedSegments")}
                                    onClick={() => this.updatePortedSegments()}
                                >
                                    <RefreshIcon style={{ height: 19, width: 19 }} />
                                </div>
                            </>
                        ) : (
                            <>
                                <input
                                    ref={this.inputRef}
                                    type="text"
                                    placeholder={chrome.i18n.getMessage("enterPortVideoURL")}
                                    className="portVideoInput"
                                ></input>
                                <button className="portVideoButton" onClick={() => this.submitPortVideo()}>
                                    {chrome.i18n.getMessage("submit")}
                                </button>
                            </>
                        )}
                    </div>
                </Spin>
            </div>
        );
    }
}
