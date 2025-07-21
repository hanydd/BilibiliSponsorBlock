import * as React from "react";
import Config from "../config";
import { showDonationLink } from "../config/configUtils";

interface PopupFooterProps {}

interface PopupFooterState {}

class PopupFooter extends React.Component<PopupFooterProps, PopupFooterState> {
    render(): React.ReactNode {
        return (
            <footer id="sbFooter">
                <a onClick={() => chrome.runtime.sendMessage({ message: "openHelp" })}>
                    {chrome.i18n.getMessage("help")}
                </a>
                <a href="https://bsbsb.top" target="_blank" rel="noopener noreferrer">
                    {chrome.i18n.getMessage("website")}
                </a>
                <a href="https://github.com/hanydd/BilibiliSponsorBlock/wiki" target="_blank" rel="noopener noreferrer">
                    Wiki
                </a>
                <a href="https://bsbsb.top/stats" target="_blank" rel="noopener noreferrer">
                    {chrome.i18n.getMessage("viewLeaderboard")}
                </a>
                <br />
                <a href="https://github.com/hanydd/BilibiliSponsorBlock" target="_blank" rel="noopener noreferrer">
                    {chrome.i18n.getMessage("projectRepo")}
                </a>
                <a href="https://status.bsbsb.top" target="_blank" rel="noopener noreferrer">
                    {chrome.i18n.getMessage("serverStatus")}
                </a>
                {showDonationLink() && (
                    <a
                        href="https://bsbsb.top/donate/"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                            Config.config.donateClicked += 1;
                        }}
                    >
                        {chrome.i18n.getMessage("Donate")}
                    </a>
                )}

                {/* if the don't show notice again variable is true, an option to disable should be available */}
                <button
                    style={Config.config.dontShowNotice ? {} : { display: "none" }}
                    onClick={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                        Config.config.dontShowNotice = false;
                    }}
                >
                    {chrome.i18n.getMessage("showNotice")}
                </button>
            </footer>
        );
    }
}

export default PopupFooter;
