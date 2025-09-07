import { LoadingOutlined } from "@ant-design/icons";
import { ConfigProvider, Spin } from "antd";
import * as React from "react";
import { showMessage } from "../render/MessageNotice";
import { PortVideo, BVID } from "../types";
import { AnimationUtils } from "../utils/animationUtils";
import { parseYoutubeID } from "../utils/parseVideoID";
import { RefreshIcon } from "./icon/refresh";

export interface DescriptionPortPillProps {
    bvID: BVID;
    ytbID: BVID;
    showYtbVideoButton: boolean;

    onSubmitPortVideo: (ytbID: BVID) => Promise<PortVideo>;
    onVote(type: number): Promise<void>;
    onRefresh(): Promise<void>;
}

export interface DescriptionPortPillState {
    show: boolean;
    showPreviewYtbVideo: boolean;
    loading: boolean;
    ytbVideoID: BVID;
    previewYtbID: BVID;
}

export class DescriptionPortPillComponent extends React.Component<DescriptionPortPillProps, DescriptionPortPillState> {
    inputRef: React.RefObject<HTMLInputElement>;

    constructor(props: DescriptionPortPillProps) {
        super(props);
        this.inputRef = React.createRef();
        this.state = {
            show: false,
            ytbVideoID: props.ytbID,
            loading: false,
            showPreviewYtbVideo: false,
            previewYtbID: props.ytbID,
        };
    }

    render(): React.ReactElement {
        return (
            <ConfigProvider>
                <Spin indicator={<LoadingOutlined spin />} delay={100} spinning={this.state.loading}>
                    <div hidden={!this.state.show} id="bsbDescriptionPortVideoPill">
                        {this.hasYtbVideo() && (
                            <>
                                <span>{chrome.i18n.getMessage("hasBoundPortVideo")}</span>
                                <a id="ytbLink" href={this.getVideoLink()} target="blank">
                                    {this.state.ytbVideoID}
                                </a>
                                <img
                                    className="bsbVoteButton"
                                    title={chrome.i18n.getMessage("upvote")}
                                    src={chrome.runtime.getURL("icons/thumbs_up_blue.svg")}
                                    onClick={(e) => this.vote(e, 1)}
                                ></img>
                                <img
                                    className="bsbVoteButton"
                                    title={chrome.i18n.getMessage("downvote")}
                                    src={chrome.runtime.getURL("icons/thumbs_down_blue.svg")}
                                    onClick={(e) => this.vote(e, 0)}
                                ></img>
                                <div
                                    className="bsbVoteButton"
                                    title={chrome.i18n.getMessage("refreshPortedSegments")}
                                    onClick={() => this.props.onRefresh()}
                                >
                                    <RefreshIcon color="#00aeec" />
                                </div>
                            </>
                        )}
                        {!this.hasYtbVideo() && (
                            <>
                                <div className="inputWrapper">
                                    <input
                                        ref={this.inputRef}
                                        type="text"
                                        placeholder={chrome.i18n.getMessage("enterPortVideoURL")}
                                        onChange={this.handleYtbInput.bind(this)}
                                    ></input>
                                </div>
                                <button className="active" onClick={() => this.submitPortVideo()}>
                                    {chrome.i18n.getMessage("submit")}
                                </button>
                            </>
                        )}

                        {this.props.showYtbVideoButton &&
                            togglePreviewYtbVideoButton(!this.state.previewYtbID, () => this.toggleYtbVideo())}
                    </div>
                </Spin>

                {this.state.previewYtbID && this.props.showYtbVideoButton && (
                    <iframe
                        hidden={!this.state.showPreviewYtbVideo}
                        id="ytbPreviewFrame"
                        src={`https://www.youtube.com/embed/${this.state.previewYtbID}`}
                        title="YouTube video player"
                        allow="clipboard-write; encrypted-media; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                    ></iframe>
                )}
            </ConfigProvider>
        );
    }

    setPortVideoData(portVideo: PortVideo): void {
        if (portVideo) {
            this.setState({ ytbVideoID: portVideo.ytbID, previewYtbID: portVideo.ytbID, loading: false });
        } else {
            this.setState({ ytbVideoID: null, previewYtbID: null, loading: false });
        }
    }

    toggleInput(): void {
        this.setState({ show: !this.state.show });
    }

    toggleYtbVideo(): void {
        this.setState({ showPreviewYtbVideo: !this.state.showPreviewYtbVideo });
    }

    private handleYtbInput(event: React.ChangeEvent<HTMLInputElement>): void {
        const ytbID = parseYoutubeID(event.target.value);
        if (ytbID) {
            this.setState({ previewYtbID: ytbID });
        } else {
            this.setState({ previewYtbID: null });
        }
    }

    private hasYtbVideo(): boolean {
        // TODO: add validation
        return !!this.state.ytbVideoID;
    }

    private submitPortVideo(): void {
        const YtbInput = this.inputRef.current.value;
        if (!YtbInput) {
            return;
        }
        const ytbID = parseYoutubeID(YtbInput);
        this.setState({ loading: true });
        this.props
            .onSubmitPortVideo(ytbID)
            .then((newPortVideo) => {
                if (newPortVideo) {
                    this.setState({ ytbVideoID: newPortVideo.ytbID, previewYtbID: newPortVideo.ytbID });
                }
            })
            .catch((e) => {
                showMessage(e, "error");
            })
            .finally(() => {
                this.setState({ loading: false });
            });
    }

    private async vote(event: React.MouseEvent, type: 0 | 1) {
        const stopAnimation = AnimationUtils.applyLoadingAnimation(event.target as HTMLElement, 0.5);
        await this.props
            .onVote(type)
            .then(() => showMessage(chrome.i18n.getMessage("voted"), "success"))
            .catch((e) => showMessage(e, "error"));
        stopAnimation();
    }

    private getVideoLink(): string {
        return `https://www.youtube.com/watch?v=${this.state.ytbVideoID}`;
    }
}

function togglePreviewYtbVideoButton(disabled: boolean, onClickCallback: () => void): React.ReactElement {
    return (
        <button id="previewYtb" className={disabled ? "" : "active"} disabled={disabled} onClick={onClickCallback}>
            {chrome.i18n.getMessage("previewYoutubeVideoButton")}
        </button>
    );
}
