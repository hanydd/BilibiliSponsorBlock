import * as React from "react";

interface ControlMenuProps {
    openOptionsAt: (section: string) => void;
}

class ControlMenu extends React.Component<ControlMenuProps> {
    constructor(props: ControlMenuProps) {
        super(props);
    }

    render() {
        return (
            <>
                {/* <!-- Toggle Box --> */}
                <div className="sbControlsMenu">
                    <label id="whitelistButton" htmlFor="whitelistToggle" className="hidden sbControlsMenu-item">
                        <input type="checkbox" style={{ display: "none" }} id="whitelistToggle" />
                        <svg
                            viewBox="0 0 24 24"
                            width="23"
                            height="23"
                            className="SBWhitelistIcon sbControlsMenu-itemIcon"
                        >
                            <path d="M24 10H14V0h-4v10H0v4h10v10h4V14h10z" />
                        </svg>
                        <span id="whitelistChannel">{chrome.i18n.getMessage("whitelistChannel")}</span>
                        <span id="unwhitelistChannel" style={{ display: "none" }}>
                            {chrome.i18n.getMessage("removeFromWhitelist")}
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

                <a id="whitelistForceCheck" className="hidden">
                    {chrome.i18n.getMessage("forceChannelCheckPopup")}
                </a>
            </>
        );
    }
}

export default ControlMenu;
