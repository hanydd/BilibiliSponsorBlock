import * as React from "react";
import { VideoID } from "../types";
import { PortVideo } from "../render/DesciptionPortPill";
import { parseYouTubeVideoIDFromURL } from "../../maze-utils/src/video";

export interface DescriptionPortPillProps {
    bvID: VideoID;
    ytbID: VideoID;
    showYtbVideoButton: boolean;

    onSubmitPortVideo: (ytbID: VideoID) => Promise<PortVideo>;
}

export interface DescriptionPortPillState {
    show: boolean;
    showPreviewYtbVideo: boolean;
    loading: boolean;
    ytbVideoID: VideoID;
    previewYtbID: VideoID;
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
            <>
                <div hidden={!this.state.loading || !this.state.show} id="bsbDescriptionPortLoading">
                    加载中...
                </div>

                <div hidden={!this.state.show} id="bsbDescriptionPortVideoPill">
                    {this.hasYtbVideo() && (
                        <>
                            <span>已绑定搬运视频：</span>
                            <a id="ytbLink" href={this.getVideoLink()} target="blank">
                                {this.state.ytbVideoID}
                            </a>
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

                    {togglePreviewYtbVideoButton(this.props.showYtbVideoButton, !this.state.previewYtbID, () =>
                        this.toggleYtbVideo()
                    )}
                </div>
                {this.state.previewYtbID && this.props.showYtbVideoButton && (
                    <iframe
                        hidden={!this.state.showPreviewYtbVideo}
                        id="ytbPreviewFrame"
                        src={`https://www.youtube.com/embed/${this.state.previewYtbID}`}
                        title="YouTube video player"
                        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
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
                console.log(newPortVideo);
                if (newPortVideo) {
                    this.setState({ ytbVideoID: newPortVideo.ytbID });
                }
            })
            .finally(() => {
                this.setState({ loading: false });
            });
    }

    private getVideoLink(): string {
        return `https://www.youtube.com/watch?v=${this.state.ytbVideoID}`;
    }
}

function togglePreviewYtbVideoButton(showButton: boolean, disabled: boolean, onClickCallback): React.ReactElement {
    return (
        showButton && (
            <button id="previewYtb" className={disabled ? "" : "active"} disabled={disabled} onClick={onClickCallback}>
                预览YouTube视频
            </button>
        )
    );
}
