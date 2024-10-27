import { LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";
import { MessageInstance } from "antd/es/message/interface";
import * as React from "react";
import Config from "../config";
import { getUserInfo, setUsername } from "../requests/user";
import { getErrorMessage, getFormattedHours } from "../utils/formating";
import { getHash } from "../utils/hash";

interface UserWorkProps {
    messageApi: MessageInstance;

    copyToClipboard: (text: string) => void;
}

interface UserWorkState {
    userName: string;
    viewCount: number;
    minutesSaved: number;
    segmentCount: number;

    editingUsername: boolean;
    usernameLoading: boolean;
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
            usernameLoading: true,
        };

        this.userNameInputRef = React.createRef<HTMLInputElement>();

        getHash(Config.config.userID)
            .then((hash) => getUserInfo(hash))
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
            })
            .finally(() => {
                this.setState({ usernameLoading: false });
            });
    }

    //make the options username setting option visible
    editUsername() {
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

        this.setState({ usernameLoading: true });

        setUsername(inputUserName)
            .then((response) => {
                if (response.status == 200) {
                    this.setState({ editingUsername: false, userName: inputUserName });
                } else {
                    this.props.messageApi.error(getErrorMessage(response.status, response.responseText));
                }
            })
            .finally(() => {
                this.setState({ usernameLoading: false });
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
                        <Spin spinning={this.state.usernameLoading} delay={50} indicator={<LoadingOutlined spin />}>
                            {this.state.editingUsername ? (
                                <div id="setUsername">
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
                            ) : (
                                <div id="setUsernameContainer">
                                    <p id="usernameValue" onClick={this.editUsername.bind(this)}>
                                        {this.state.userName}
                                    </p>
                                    <button
                                        id="setUsernameButton"
                                        title={chrome.i18n.getMessage("setUsername")}
                                        onClick={this.editUsername.bind(this)}
                                    >
                                        <img
                                            src="/icons/pencil.svg"
                                            alt={chrome.i18n.getMessage("setUsername")}
                                            width="16"
                                            height="16"
                                        />
                                    </button>
                                    <button
                                        id="copyUserID"
                                        title={chrome.i18n.getMessage("copyPublicID")}
                                        onClick={async () =>
                                            this.props.copyToClipboard(await getHash(Config.config.userID))
                                        }
                                    >
                                        <img
                                            src="/icons/clipboard.svg"
                                            alt={chrome.i18n.getMessage("copyPublicID")}
                                            width="16"
                                            height="16"
                                        />
                                    </button>
                                </div>
                            )}
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
