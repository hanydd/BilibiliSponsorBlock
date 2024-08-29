import { Popover, Spin } from "antd";
import * as React from "react";
import Config from "../config";
import { asyncRequestToServer } from "../requests/requests";
import { getErrorMessage, getFormattedHours } from "../utils/formating";
import { getHash } from "../utils/hash";

interface UserWorkProps {
    copyToClipboard: (text: string) => void;
}

interface UserWorkState {
    userName: string;
    viewCount: number;
    minutesSaved: number;
    segmentCount: number;

    editingUsername: boolean;
    editUsernameLoading: boolean;
    editUserNameError: string;
}

class UserWork extends React.Component<UserWorkProps, UserWorkState> {
    userNameInputRef: React.RefObject<HTMLInputElement>;

    constructor(props: UserWorkProps) {
        super(props);
        this.state = {
            userName: "",
            viewCount: null,
            minutesSaved: 0,
            segmentCount: Config.config.sponsorTimesContributed,
            editingUsername: false,
            editUsernameLoading: false,
            editUserNameError: null,
        };

        this.userNameInputRef = React.createRef<HTMLInputElement>();

        getHash(Config.config.userID)
            .then((hash) =>
                asyncRequestToServer("GET", "/api/userInfo", {
                    publicUserID: hash,
                    values: ["userName", "viewCount", "minutesSaved", "vip", "permissions", "segmentCount"],
                })
            )
            .then((res) => {
                if (res.status === 200) {
                    const userInfo = JSON.parse(res.responseText);
                    this.setState({
                        userName: userInfo.userName,
                        viewCount: userInfo.viewCount,
                        minutesSaved: userInfo.minutesSaved,
                        segmentCount: userInfo.segmentCount,
                    });

                    Config.config.isVip = userInfo.vip;
                    Config.config.permissions = userInfo.permissions;
                    Config.config.sponsorTimesContributed = userInfo.segmentCount;
                }
            });
    }

    //make the options username setting option visible
    setUsernameButton() {
        this.setState({ editingUsername: true });
    }

    //submit the new username
    submitUsername() {
        const inputUserName = this.userNameInputRef.current.value;
        if (!inputUserName || inputUserName.length == 0) {
            return;
        }
        if (inputUserName === this.state.userName) {
            this.setState({ editingUsername: false });
            return;
        }

        this.setState({ editUsernameLoading: true });

        asyncRequestToServer("POST", "/api/setUsername?userID=" + Config.config.userID + "&username=" + inputUserName)
            .then((response) => {
                if (response.status == 200) {
                    this.setState({ editingUsername: false, userName: inputUserName, editUserNameError: null });
                } else {
                    this.setState({ editUserNameError: getErrorMessage(response.status, response.responseText) });
                    setTimeout(() => this.setState({ editUserNameError: null }), 5000);
                }
            })
            .finally(() => {
                this.setState({ editUsernameLoading: false });
            });
    }

    render(): React.ReactNode {
        return (
            <div className={"sbYourWorkBox"}>
                <h1 className="sbHeader" style={{ padding: "8px 15px" }}>
                    {chrome.i18n.getMessage("yourWork")}
                </h1>
                <div className="sbYourWorkCols">
                    {/* <!-- Username --> */}
                    <div id="usernameElement">
                        <p className="u-mZ grey-text">{chrome.i18n.getMessage("Username")}</p>
                        <div id="setUsernameContainer" style={{ display: this.state.editingUsername ? "none" : "" }}>
                            <p id="usernameValue" onClick={this.setUsernameButton.bind(this)}>
                                {this.state.userName}
                            </p>
                            <button
                                id="setUsernameButton"
                                title={chrome.i18n.getMessage("setUsername")}
                                onClick={this.setUsernameButton.bind(this)}
                            >
                                <img
                                    src="/icons/pencil.svg"
                                    alt={chrome.i18n.getMessage("setUsername")}
                                    width="16"
                                    height="16"
                                    id="sbPopupIconEdit"
                                />
                            </button>
                            <button
                                id="copyUserID"
                                title={chrome.i18n.getMessage("copyPublicID")}
                                onClick={async () => this.props.copyToClipboard(await getHash(Config.config.userID))}
                            >
                                <img
                                    src="/icons/clipboard.svg"
                                    alt={chrome.i18n.getMessage("copyPublicID")}
                                    width="16"
                                    height="16"
                                />
                            </button>
                        </div>
                        <Spin spinning={this.state.editUsernameLoading} delay={50}>
                            <Popover
                                content={this.state.editUserNameError}
                                open={this.state.editUserNameError != null}
                                arrow={false}
                                autoAdjustOverflow={false}
                                destroyTooltipOnHide={true}
                            >
                                <div
                                    id="setUsername"
                                    style={{ display: this.state.editingUsername ? "flex" : "none" }}
                                    className="SBExpanded"
                                >
                                    <input
                                        ref={this.userNameInputRef}
                                        id="usernameInput"
                                        placeholder="Username"
                                        defaultValue={this.state.userName}
                                    />
                                    <button id="submitUsername" onClick={this.submitUsername.bind(this)}>
                                        <img
                                            src="/icons/check.svg"
                                            alt={chrome.i18n.getMessage("setUsername")}
                                            width="16"
                                            height="16"
                                        />
                                    </button>
                                </div>
                            </Popover>
                        </Spin>
                    </div>
                    {/* <!-- Submissions --> */}
                    {!this.state.editingUsername && (
                        <div id="sponsorTimesContributionsContainer">
                            <p className="u-mZ grey-text">{chrome.i18n.getMessage("Submissions")}</p>
                            <p id="sponsorTimesContributionsDisplay" className="u-mZ">
                                {this.state.segmentCount.toLocaleString()}
                            </p>
                        </div>
                    )}
                </div>

                {this.state.viewCount > 0 && (
                    <p className="u-mZ sbStatsSentence">
                        {chrome.i18n.getMessage("savedPeopleFrom")}
                        <b>{this.state.viewCount.toLocaleString()}</b>
                        &nbsp;
                        <span>{chrome.i18n.getMessage("Segments")}</span>
                        <br />
                        <span className="sbExtraInfo">
                            (<b>{getFormattedHours(this.state.minutesSaved)}</b>
                            <span>{chrome.i18n.getMessage("youHaveSavedTimeEnd")}</span>)
                        </span>
                    </p>
                )}
                <p
                    style={{ display: Config.config.skipCount != undefined ? "block" : "none" }}
                    className="u-mZ sbStatsSentence"
                >
                    {chrome.i18n.getMessage("youHaveSkipped")}
                    <b>
                        &nbsp;
                        {Config.config.skipCount.toLocaleString()}
                        &nbsp;
                    </b>
                    <span>{chrome.i18n.getMessage("Segments")}</span>
                    <span className="sbExtraInfo">
                        （<b>{getFormattedHours(Config.config.minutesSaved)}</b>）
                    </span>
                </p>
            </div>
        );
    }
}

export default UserWork;
