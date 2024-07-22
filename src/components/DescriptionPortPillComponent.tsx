import * as React from "react";
import { VideoID } from "../types";
import { PortVideo } from "../render/DesciptionPortPill";
import { parseYouTubeVideoIDFromURL } from "../../maze-utils/src/video";
import { AnimationUtils } from "../../maze-utils/src/animationUtils";

export interface DescriptionPortPillProps {
    bvID: VideoID;
    ytbID: VideoID;
    showYtbVideoButton: boolean;

    onSubmitPortVideo: (ytbID: VideoID) => Promise<PortVideo>;
    onVote(type: number): Promise<void>;
}

export interface DescriptionPortPillState {
    show: boolean;
    showPreviewYtbVideo: boolean;
    loading: boolean;
    ytbVideoID: VideoID;
    previewYtbID: VideoID;
    showErrorMessage: boolean;
}

export class DescriptionPortPillComponent extends React.Component<DescriptionPortPillProps, DescriptionPortPillState> {
    inputRef: React.RefObject<HTMLInputElement>;
    errorMessage: string;

    constructor(props: DescriptionPortPillProps) {
        super(props);
        this.inputRef = React.createRef();
        this.errorMessage = "";
        this.state = {
            show: false,
            ytbVideoID: props.ytbID,
            loading: false,
            showPreviewYtbVideo: false,
            previewYtbID: props.ytbID,
            showErrorMessage: false,
        };
    }

    render(): React.ReactElement {
        return (
            <>
                <div
                    hidden={!(this.state.show && this.state.showErrorMessage)}
                    className={this.state.showErrorMessage ? "active" : ""}
                    id="bsbDescriptionPortErrorBox"
                >
                    {this.errorMessage}
                </div>

                <div hidden={!(this.state.loading && this.state.show)} id="bsbDescriptionPortLoading">
                    加载中...
                </div>

                <div hidden={!this.state.show} id="bsbDescriptionPortVideoPill">
                    {this.hasYtbVideo() && (
                        <>
                            <span>已绑定搬运视频：</span>
                            <a id="ytbLink" href={this.getVideoLink()} target="blank">
                                {this.state.ytbVideoID}
                            </a>
                            <img
                                className="bsbVoteButton"
                                title="点赞"
                                src={chrome.runtime.getURL("icons/thumbs_up_blue.svg")}
                                onClick={(e) => this.vote(e, 1)}
                            ></img>
                            <img
                                className="bsbVoteButton"
                                title="点踩"
                                src={chrome.runtime.getURL("icons/thumbs_down_blue.svg")}
                                onClick={(e) => this.vote(e, 0)}
                            ></img>
                        </>
                    )}
                    {!this.hasYtbVideo() && (
                        <>
                            <div className="inputWrapper">
                                <input ref={this.inputRef} type="text" placeholder="请输入搬运视频地址"></input>
                            </div>
                            <button className="active" onClick={() => this.submitPortVideo()}>
                                提交
                            </button>
                        </>
                    )}

                    {this.props.showYtbVideoButton &&
                        togglePreviewYtbVideoButton(!this.state.previewYtbID, () => this.toggleYtbVideo())}
                </div>

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
            </>
        );
    }

    toggleInput(): void {
        this.setState({ show: !this.state.show });
    }

    toggleYtbVideo(): void {
        this.setState({ showPreviewYtbVideo: !this.state.showPreviewYtbVideo });
    }

    private showErrorMessage(message: string): void {
        this.errorMessage = message;
        this.setState({ showErrorMessage: true });
        const timeout = setTimeout(() => {
            this.setState({ showErrorMessage: false });
            this.errorMessage = "";
            clearTimeout(timeout);
        }, 4990);
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
        const ytbID = parseYouTubeVideoIDFromURL(YtbInput).videoID;
        this.setState({ loading: true });
        this.props
            .onSubmitPortVideo(ytbID)
            .then((newPortVideo) => {
                if (newPortVideo) {
                    this.setState({ ytbVideoID: newPortVideo.ytbID, previewYtbID: newPortVideo.ytbID });
                }
            })
            .catch((e) => {
                this.showErrorMessage(e);
            })
            .finally(() => {
                this.setState({ loading: false });
            });
    }

    private async vote(event: React.MouseEvent, type: 0 | 1) {
        const stopAnimation = AnimationUtils.applyLoadingAnimation(event.target as HTMLElement, 0.5);
        await this.props.onVote(type).catch((e) => {
            this.showErrorMessage(e);
        });
        stopAnimation();
    }

    private getVideoLink(): string {
        return `https://www.youtube.com/watch?v=${this.state.ytbVideoID}`;
    }
}

function togglePreviewYtbVideoButton(disabled: boolean, onClickCallback: () => void): React.ReactElement {
    return (
        <button id="previewYtb" className={disabled ? "" : "active"} disabled={disabled} onClick={onClickCallback}>
            预览YouTube视频
        </button>
    );
}
