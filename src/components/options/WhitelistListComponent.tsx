import * as React from "react";
import Config from "../../config";

export interface WhitelistListProps {}

export interface WhitelistListState {}

class WhitelistListComponent extends React.Component<WhitelistListProps, WhitelistListState> {
    constructor(props: WhitelistListProps) {
        super(props);
        this.state = {};
    }

    render(): React.ReactElement {
        const whitelistedChannels = Config.config.whitelistedChannels || [];

        if (whitelistedChannels.length === 0) {
            return (
                <div style={{ marginTop: "15px", color: "#888" }}>
                    {chrome.i18n.getMessage("whitelistEmptyHint")}
                </div>
            );
        }

        return (
            <div style={{ maxHeight: "300px", overflowY: "auto", marginTop: "15px" }}>
                <table className="categoryChooserTable">
                    <thead>
                        <tr className="categoryTableElement categoryTableHeader">
                            <th>{chrome.i18n.getMessage("whitelistUploaderName")}</th>
                            <th>{chrome.i18n.getMessage("whitelistUploaderId")}</th>
                            <th>{chrome.i18n.getMessage("whitelistActions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {whitelistedChannels.map((channel) => (
                            <tr key={channel.id} className="categoryTableElement">
                                <td>
                                    <a
                                        href={`https://space.bilibili.com/${channel.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: "inherit", textDecoration: "underline" }}
                                    >
                                        {channel.name}
                                    </a>
                                </td>
                                <td>{channel.id}</td>
                                <td>
                                    <div
                                        className="option-button inline"
                                        onClick={() => this.removeChannel(channel.id)}
                                        style={{ fontSize: "0.9em", padding: "5px 10px" }}
                                    >
                                        {chrome.i18n.getMessage("whitelistRemove")}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    removeChannel(channelId: string): void {
        if (!confirm(chrome.i18n.getMessage("removeFromWhitelistConfirm"))) {
            return;
        }

        let whitelistedChannels = Config.config.whitelistedChannels || [];
        whitelistedChannels = whitelistedChannels.filter((ch) => ch.id !== channelId);
        Config.config.whitelistedChannels = whitelistedChannels;

        // Force re-render
        this.forceUpdate();
    }
}

export default WhitelistListComponent;

