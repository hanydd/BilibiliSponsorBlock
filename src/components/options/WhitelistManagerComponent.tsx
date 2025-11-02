import * as React from "react";
import Config from "../../config";
import WhitelistListComponent from "./WhitelistListComponent";

export interface WhitelistManagerProps {}

export interface WhitelistManagerState {
    tableVisible: boolean;
}

class WhitelistManagerComponent extends React.Component<WhitelistManagerProps, WhitelistManagerState> {
    constructor(props: WhitelistManagerProps) {
        super(props);

        this.state = {
            tableVisible: false,
        };
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
                    <>
                        <div
                            className="option-button inline"
                            onClick={() => this.setState({ tableVisible: !this.state.tableVisible })}
                        >
                            {chrome.i18n.getMessage(
                                this.state.tableVisible ? "hideWhitelist" : "showWhitelist"
                            )}
                        </div>{" "}
                        <div className="option-button inline" onClick={this.clearWhitelist.bind(this)}>
                            {chrome.i18n.getMessage("clearWhitelist")}
                        </div>
                    </>
                )}
                {this.state.tableVisible && <WhitelistListComponent />}
            </>
        );
    }

    clearWhitelist(): void {
        if (!confirm(chrome.i18n.getMessage("clearWhitelistConfirm"))) {
            return;
        }

        Config.config.whitelistedChannels = [];
        this.setState({ tableVisible: false });
    }
}

export default WhitelistManagerComponent;

