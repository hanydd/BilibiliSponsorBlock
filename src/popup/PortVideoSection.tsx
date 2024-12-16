import { LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";
import { MessageInstance } from "antd/es/message/interface";
import * as React from "react";
import { Message } from "../messageTypes";
import { PortVideo } from "../types";
import { parseYoutubeID } from "../utils/parseVideoID";

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
        console.log("portvideo submitPortVideo", ytbID, this.state);
        this.setState({ loading: true });

        try {
            await this.props.sendTabMessageAsync({ message: "submitPortVideo", ytbID: ytbID });
        } catch (e) {
            this.props.messageApi.error(e.getMessage());
        }
    }

    render() {
        return (
            <div>
                {this.state.show && (
                    <Spin indicator={<LoadingOutlined spin />} delay={100} spinning={this.state.loading}>
                        {this.hasPortVideo() ? (
                            <>
                                <span>{chrome.i18n.getMessage("hasbindedPortVideo")}</span>
                                <span>{this.state.portVideo.ytbID}</span>
                            </>
                        ) : (
                            <>
                                <input
                                    ref={this.inputRef}
                                    type="text"
                                    placeholder={chrome.i18n.getMessage("enterPortVideoURL")}
                                ></input>
                                <button className="active" onClick={() => this.submitPortVideo()}>
                                    {chrome.i18n.getMessage("submit")}
                                </button>
                            </>
                        )}
                    </Spin>
                )}
            </div>
        );
    }
}
