import * as React from "react";
import Config from "../../config";
import WhitelistListComponent from "./WhitelistListComponent";

export interface WhitelistManagerProps {}

export interface WhitelistManagerState {}

class WhitelistManagerComponent extends React.Component<WhitelistManagerProps, WhitelistManagerState> {
    constructor(props: WhitelistManagerProps) {
        super(props);
        this.state = {};
    }

    render(): React.ReactElement {
        const channelCount = (Config.config.whitelistedChannels || []).length;

        return (
            <>
                <h2>{chrome.i18n.getMessage("whitelistManagement")}</h2>
                <div style={{ marginBottom: "10px" }}>
                    {channelCount === 0
                        ? chrome.i18n.getMessage("whitelistCountZero")
                        : chrome.i18n.getMessage("whitelistCount").replace("{0}", channelCount.toString())}
                </div>
                {channelCount > 0 && (
                    <div className="option-button inline" onClick={this.clearWhitelist.bind(this)}>
                        {chrome.i18n.getMessage("clearWhitelist")}
                    </div>
                )}
                <WhitelistListComponent />
            </>
        );
    }

    clearWhitelist(): void {
        if (!confirm(chrome.i18n.getMessage("clearWhitelistConfirm"))) {
            return;
        }

        Config.config.whitelistedChannels = [];
        this.forceUpdate();
    }
}

export default WhitelistManagerComponent;

