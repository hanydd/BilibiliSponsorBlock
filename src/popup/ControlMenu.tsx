import * as React from "react";
import Config from "../config";
import { GetChannelIDResponse, Message } from "../messageTypes";

interface ControlMenuProps {
    openOptionsAt: (section: string) => void;
    sendTabMessage: (data: Message, callback?) => void;
    sendTabMessageAsync: (data: Message) => Promise<unknown>;
}

interface ControlMenuState {
    hasVideo: boolean;
    hasWhiteListed: boolean;
}

class ControlMenu extends React.Component<ControlMenuProps, ControlMenuState> {
    constructor(props: ControlMenuProps) {
        super(props);
        this.state = {
            hasVideo: false,
            hasWhiteListed: false,
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
        //get the channel url
        const response = (await this.props.sendTabMessageAsync({ message: "getChannelID" })) as GetChannelIDResponse;
        if (!response.channelID) {
            alert(
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

        // add on this channel
        whitelistedChannels.push(response.channelID);

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
        //get the channel url
        const response = (await this.props.sendTabMessageAsync({ message: "getChannelID" })) as GetChannelIDResponse;

        //get whitelisted channels
        let whitelistedChannels = Config.config.whitelistedChannels;
        if (whitelistedChannels == undefined) {
            whitelistedChannels = [];
        }

        //remove this channel
        const index = whitelistedChannels.indexOf(response.channelID);
        whitelistedChannels.splice(index, 1);

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

    render() {
        return (
            <>
                {/* <!-- Toggle Box --> */}
                <div className="sbControlsMenu">
                    <label
                        id="whitelistButton"
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
                    {/* <!--github: mbledkowski/toggle-switch--> */}
                    <label
                        id="disableExtension"
                        htmlFor="toggleSwitch"
                        className="toggleSwitchContainer sbControlsMenu-item"
                    >
                        <span className="toggleSwitchContainer-switch">
                            <input
                                type="checkbox"
                                style={{ display: "none" }}
                                id="toggleSwitch"
                                defaultChecked={true}
                            />
                            <span className="switchBg shadow"></span>
                            <span className="switchBg white"></span>
                            <span className="switchBg green"></span>
                            <span className="switchDot"></span>
                        </span>
                        <span id="disableSkipping">{chrome.i18n.getMessage("disableSkipping")}</span>
                        <span id="enableSkipping" style={{ display: "none" }}>
                            {chrome.i18n.getMessage("enableSkipping")}
                        </span>
                    </label>
                    <button
                        className="sbControlsMenu-item"
                        title={chrome.i18n.getMessage("optionsInfo")}
                        onClick={() => {
                            this.props.openOptionsAt("behavior");
                        }}
                    >
                        <img
                            src="/icons/settings.svg"
                            alt="Settings icon"
                            width="23"
                            height="23"
                            className="sbControlsMenu-itemIcon"
                            id="sbPopupIconSettings"
                        />
                        {chrome.i18n.getMessage("Options")}
                    </button>
                </div>

                <a
                    id="whitelistForceCheck"
                    className={this.state.hasWhiteListed && !Config.config.forceChannelCheck ? "" : "hidden"}
                >
                    {chrome.i18n.getMessage("forceChannelCheckPopup")}
                </a>
            </>
        );
    }
}

export default ControlMenu;
