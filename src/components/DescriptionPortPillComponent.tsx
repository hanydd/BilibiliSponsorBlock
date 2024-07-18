import * as React from "react";
import { VideoID } from "../types";

export interface DescriptionPortPillProps {
    bvID: VideoID;
    ytbID: VideoID;
}

export interface DescriptionPortPillState {
    ytbVideoID: VideoID;
}

export class DescriptionPortPillComponent extends React.Component<DescriptionPortPillProps, DescriptionPortPillState> {
    constructor(props: DescriptionPortPillProps) {
        super(props);
        this.state = { ytbVideoID: props.ytbID };
    }

    render(): React.ReactElement {
        return (
            <div>
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
                        <input></input>
                        <button onClick={() => this.clickHandler()}>提交</button>
                    </div>
                }
            </div>
        )
    }

    private clickHandler(): void {
        this.setState({ ytbVideoID: this.state.ytbVideoID });
    }

    private getVideoLink(): string {
        return `https://www.youtube.com/watch?v=${this.state.ytbVideoID}`;
    }

}
