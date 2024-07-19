import * as React from "react";
import { VideoID } from "../types";
import { PortVideo } from "../render/DesciptionPortPill";
import { parseYouTubeVideoIDFromURL } from "../../maze-utils/src/video";

export interface DescriptionPortPillProps {
    bvID: VideoID;
    ytbID: VideoID;

    onSubmitPortVideo: (ytbID: VideoID) => Promise<PortVideo>;
}

export interface DescriptionPortPillState {
    loading: boolean;
    ytbVideoID: VideoID;
}

export class DescriptionPortPillComponent extends React.Component<DescriptionPortPillProps, DescriptionPortPillState> {
    inputRef: React.RefObject<HTMLInputElement>;

    constructor(props: DescriptionPortPillProps) {
        super(props);
        this.state = { ytbVideoID: props.ytbID, loading: false };
        this.inputRef = React.createRef();
    }

    render(): React.ReactElement {
        return (
            <>
                {
                    this.state.loading &&
                    <div>加载中...</div>
                }
                {
                    !!this.state.ytbVideoID &&
                    <div>
                        <span>已经绑定搬运视频：
                            <a href={this.getVideoLink()} target="blank">{this.state.ytbVideoID}</a>
                        </span>
                    </div>
                }
                {
                    !this.state.ytbVideoID &&
                    <div>
                        <span>输入搬运视频地址：</span>
                        <input type="text" ref={this.inputRef}></input>
                        <button onClick={() => this.submitPortVideo()}>提交</button>
                    </div>
                }
            </>
        )
    }

    private submitPortVideo(): void {
        const YtbInput = this.inputRef.current.value;
        if (!YtbInput) {
            return;
        }
        const ytbID = parseYouTubeVideoIDFromURL(YtbInput).videoID;
        this.setState({ loading: true });
        this.props.onSubmitPortVideo(ytbID).then((newPortVideo) => {
            console.log(newPortVideo);
            if (newPortVideo) {
                this.setState({ ytbVideoID: newPortVideo.ytbID });
            }
        }).finally(() => {
            this.setState({ loading: false });
        });
    }

    private getVideoLink(): string {
        return `https://www.youtube.com/watch?v=${this.state.ytbVideoID}`;
    }

}
