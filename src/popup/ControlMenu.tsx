import { ConfigProvider, Switch, theme } from "antd";
import { MessageInstance } from "antd/es/message/interface";
import * as React from "react";
import Config from "../config";
import { GetChannelIDResponse, Message } from "../messageTypes";

interface ControlMenuProps {
    messageApi: MessageInstance;

    openOptionsAt: (section: string) => void;
    sendTabMessage: (data: Message, callback?) => void;
    sendTabMessageAsync: (data: Message) => Promise<unknown>;
}

interface ControlMenuState {
    hasVideo: boolean;
    hasWhiteListed: boolean;
    disableSkipping: boolean;
}

class ControlMenu extends React.Component<ControlMenuProps, ControlMenuState> {
    constructor(props: ControlMenuProps) {
        super(props);
        this.state = {
            hasVideo: false,
            hasWhiteListed: false,
            disableSkipping: Config.config.disableSkipping,
        };
    }

    toggleWhiteList() {
        if (this.state.hasWhiteListed) {
            this.unwhitelistChannel();
        } else {
            this.whitelistChannel();
        }
    }

    async whitelistChannel() {
        //get the channel info
        const response = (await this.props.sendTabMessageAsync({ message: "getChannelInfo" })) as import("../messageTypes").GetChannelInfoResponse;
        if (!response.channelID) {
            this.props.messageApi.error(
                chrome.i18n.getMessage("channelDataNotFound") +
                    " https://github.com/hanydd/BilibiliSponsorBlock/issues/1"
            );
            return;
        }

        //get whitelisted channels
        let whitelistedChannels = Config.config.whitelistedChannels;
        if (whitelistedChannels == undefined) {
            whitelistedChannels = [];
        }

        // add on this channel with name
        whitelistedChannels.push({
            id: response.channelID,
            name: response.channelName,
        });

        //change button
        this.setState({ hasWhiteListed: true });

        //save this
        Config.config.whitelistedChannels = whitelistedChannels;

        //send a message to the client
        this.props.sendTabMessage({
            message: "whitelistChange",
            value: true,
        });
    }

    async unwhitelistChannel() {
        //get the channel id
        const response = (await this.props.sendTabMessageAsync({ message: "getChannelID" })) as GetChannelIDResponse;

        //get whitelisted channels
        let whitelistedChannels = Config.config.whitelistedChannels;
        if (whitelistedChannels == undefined) {
            whitelistedChannels = [];
        }

        //remove this channel
        const index = whitelistedChannels.findIndex(ch => ch.id === response.channelID);
        if (index !== -1) {
            whitelistedChannels.splice(index, 1);
        }

        //change button
        this.setState({ hasWhiteListed: false });

        //save this
        Config.config.whitelistedChannels = whitelistedChannels;

        //send a message to the client
        this.props.sendTabMessage({
            message: "whitelistChange",
            value: false,
        });
    }

    /**
     * Should skipping be disabled (visuals stay)
     */
    toggleSkipping() {
        Config.config.disableSkipping = !Config.config.disableSkipping;
        this.setState({ disableSkipping: Config.config.disableSkipping });
    }

    render() {
        return (
            <>
                {/* <!-- Toggle Box --> */}
                <div className="sbControlsMenu">
                    <label
                        className={"sbControlsMenu-item" + (this.state.hasVideo ? "" : " hidden")}
                        onClick={this.toggleWhiteList.bind(this)}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            width="23"
                            height="23"
                            className={
                                "SBWhitelistIcon sbControlsMenu-itemIcon" +
                                (this.state.hasWhiteListed ? " rotated" : "")
                            }
                        >
                            <path d="M24 10H14V0h-4v10H0v4h10v10h4V14h10z" />
                        </svg>

                        <span>
                            {chrome.i18n.getMessage(
                                this.state.hasWhiteListed ? "removeFromWhitelist" : "whitelistChannel"
                            )}
                        </span>
                    </label>

                    <label htmlFor="toggleSwitch" className="toggleSwitchContainer sbControlsMenu-item">
                        <ConfigProvider
                            theme={{
                                algorithm: theme.defaultAlgorithm,
                                token: {
                                    colorPrimary: "#00a205",
                                    colorTextQuaternary: "#ccc",
                                    colorTextTertiary: "#ddd",
                                },
                                components: { Switch: { trackMinWidth: 50, trackHeight: 23 } },
                            }}
                        >
                            <Switch
                                id="toggleSwitch"
                                checked={!this.state.disableSkipping}
                                onChange={this.toggleSkipping.bind(this)}
                                className="toggleSwitchContainer-switch"
                            ></Switch>
                        </ConfigProvider>
                        <span>
                            {chrome.i18n.getMessage(this.state.disableSkipping ? "enableSkipping" : "disableSkipping")}
                        </span>
                    </label>
                    <button
                        className="sbControlsMenu-item"
                        title={chrome.i18n.getMessage("optionsInfo")}
                        onClick={() => this.props.openOptionsAt("behavior")}
                    >
                        <img
                            src="/icons/settings.svg"
                            alt="Settings icon"
                            width="23"
                            height="23"
                            className="sbControlsMenu-itemIcon"
                        />
                        {chrome.i18n.getMessage("Options")}
                    </button>
                </div>

                <a
                    id="whitelistForceCheck"
                    className={this.state.hasWhiteListed && !Config.config.forceChannelCheck ? "" : "hidden"}
                    onClick={() => this.props.openOptionsAt("behavior")}
                >
                    {chrome.i18n.getMessage("forceChannelCheckPopup")}
                </a>
            </>
        );
    }
}

export default ControlMenu;
