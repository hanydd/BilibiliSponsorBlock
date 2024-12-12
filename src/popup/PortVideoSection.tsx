import { MessageInstance } from "antd/es/message/interface";
import * as React from "react";
import { Message } from "../messageTypes";
import { parseYoutubeID } from "../utils/parseVideoID";
import { PortVideo } from "../types";

interface PortVideoProps {
    messageApi: MessageInstance;
    sendTabMessage: (data: Message, callback?) => void;
    sendTabMessageAsync: (data: Message) => Promise<unknown>;
}

interface PortVideoState {
    portVideo: PortVideo;
}

export class PortVideoSection extends React.Component<PortVideoProps, PortVideoState> {
    constructor(props: PortVideoProps) {
        super(props);
        this.state = {
            portVideo: null,
        };
    }

    private inputRef = React.createRef<HTMLInputElement>();

    private hasPortVideo(): boolean {
        return !!this.state.portVideo;
    }

    private async submitPortVideo(): Promise<void> {
        const YtbInput = this.inputRef.current.value;
        if (!YtbInput) {
            return;
        }
        const ytbID = parseYoutubeID(YtbInput);
        // this.setState({ loading: true });

        try {
            const newPortVideo = await this.props.sendTabMessageAsync({ message: "submitPortVideo", ytbID: ytbID });
            if (newPortVideo) {
                this.setState({ portVideo: newPortVideo as PortVideo });
            }
        } catch (e) {
            this.props.messageApi.error(e.getMessage());
        }
    }

    render() {
        return (
            <div>
                {this.hasPortVideo() ? (
                    <div>
                        <div>{this.state.portVideo.ytbID}</div>
                    </div>
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
            </div>
        );
    }
}
