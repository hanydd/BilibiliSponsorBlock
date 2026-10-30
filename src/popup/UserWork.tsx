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
    contributionCalendarNewDismissed: boolean;
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
            contributionCalendarNewDismissed: Config.local.contributionCalendarNewDismissed,
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
                            <div className="sbContributionHeading">
                                <p className="u-mZ grey-text">{chrome.i18n.getMessage("Submissions")}</p>
                                <span className="sbContributionEntry">
                                <button className="sbContributionCalendar" aria-label="贡献日历" title="查看贡献日历和每日收获"
                                    onClick={() => chrome.runtime.sendMessage({ message: "openPage", url: "contributions/index.html" })}>
                                    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                                        <rect x="3" y="4.5" width="14" height="13" rx="2" />
                                        <path d="M6.5 2.5v4M13.5 2.5v4M3 8.5h14M6 12h2M10 12h2M6 15h2" />
                                    </svg>
                                </button>
                                {!this.state.contributionCalendarNewDismissed && (
                                    <span className="sbContributionNew">
                                        <button aria-label="不再显示贡献日历的新功能提示" title="不再提示"
                                            onClick={() => {
                                                Config.local.contributionCalendarNewDismissed = true;
                                                this.setState({ contributionCalendarNewDismissed: true });
                                            }}><em>新！</em><span aria-hidden="true">×</span></button>
                                    </span>
                                )}
                                </span>
                            </div>
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
