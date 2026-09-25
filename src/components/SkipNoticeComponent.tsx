import * as React from "react";
import * as CompileConfig from "../../config.json";
import Config from "../config";
import { ActionType, Category, SegmentUUID, SponsorSourceType, SponsorTime } from "../types";
import Utils from "../utils";
import { getAdvanceSkipText, getSkippingText } from "../utils/categoryUtils";
import { upcomingSkipDecision } from "../notices/UpcomingSkipDecision";
import StackNoticeComponent from "./StackNoticeComponent";
import { expandStackCard, setStackCardExpanded } from "../render/SkipNoticeStack";
import NoticeTextSelectionComponent from "./NoticeTextSectionComponent";
const utils = new Utils();

import { keybindToString } from "../config/config";
import { ContentContainer } from "../ContentContainerTypes";
import PencilSvg from "../svg-icons/pencil_svg";
import ThumbsDownSvg from "../svg-icons/thumbs_down_svg";
import ThumbsUpSvg from "../svg-icons/thumbs_up_svg";
import { getFormattedTime } from "../utils/formating";
import { downvoteButtonColor, noticeSegmentsIntersect, SkipNoticeAction } from "../utils/noticeUtils";
import { generateUserID } from "../utils/setup";
import { getCid, getVideo, getVideoID } from "../utils/video";
import { cancelSpeedUp, clearManuallyCancelled, getActiveSpeedUpInfo, getSpeedUpNoticeEnd, startSpeedUp } from "../content/speedUpManager";
import { getContentApp } from "../content/app";
import { CONTENT_EVENTS } from "../content/app/events";

import { SegmentPlaybackState, initialPlayback, noticePresentation } from "../notices/SkipNoticeModel";

export interface SkipNoticeProps {
    segments: SponsorTime[];

    autoSkip: boolean;
    startReskip?: boolean;
    advanceSkipNotice?: boolean;
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    closeListener: () => void;
    onInteractionChange: () => void;
    showKeybindHint?: boolean;
    id: string;
    revision: number;

    unskipTime?: number;
}

export interface SkipNoticeState {
    compact?: boolean;

    messages?: string[];
    messageOnClick?: (event: React.MouseEvent) => unknown;

    maxCountdownTime?: () => number;

    playback?: SegmentPlaybackState[];
    showSkipButton?: boolean[];

    editing?: boolean;
    choosingCategory?: boolean;
    thanksForVotingText?: string; //null until the voting buttons should be hidden

    actionState?: SkipNoticeAction;

    voted?: SkipNoticeAction[];
    copied?: SkipNoticeAction[];

    /** 当前 notice 的快进是否被用户暂停（暂停后按钮变为"恢复快进"） */
    speedUpPaused?: boolean;
}

class SkipNoticeComponent extends React.Component<SkipNoticeProps, SkipNoticeState> {
    private playerResizeObserver?: ResizeObserver;
    private video?: HTMLVideoElement;
    private expirePending = (event: Event): void => {
        if (this.props.autoSkip || this.isSpeedUpForCurrentSegment() || this.props.advanceSkipNotice || this.state.playback[0] !== SegmentPlaybackState.Pending) return;
        if (this.segments.every((segment) => segment.actionType === ActionType.Skip &&
            // The scheduler can hand off slightly before the native media time
            // reaches this segment. Only an explicit seek cancels that lead-in.
            ((event.type === "seeking" && this.video.currentTime < segment.segment[0]) || this.video.currentTime >= segment.segment[1]))) {
            this.closeListener();
        }
    };

    get segments(): SponsorTime[] { return this.props.segments; }
    get contentContainer(): ContentContainer { return this.props.contentContainer; }

    idSuffix = "";

    noticeRef: React.MutableRefObject<StackNoticeComponent>;
    categoryOptionRef: React.RefObject<HTMLSelectElement>;

    selectedColor: string;
    unselectedColor: string;
    lockedColor: string;

    // Used to update on config change
    configListener: (changes: Record<string, unknown>) => void;

    constructor(props: SkipNoticeProps) {
        super(props);
        this.noticeRef = React.createRef();
        this.categoryOptionRef = React.createRef();

        this.idSuffix = props.id;

        this.selectedColor = Config.config.colorPalette.red;
        this.unselectedColor = Config.config.colorPalette.white;
        this.lockedColor = Config.config.colorPalette.locked;

        const isMuteSegment = this.segments[0].actionType === ActionType.Mute;
        const maxCountdownTime = isMuteSegment || !props.autoSkip
            ? this.getFullDurationCountdown(0)
            : () => Config.config.skipNoticeDuration;

        const playback = initialPlayback(props.autoSkip, props.startReskip, this.segments[0].actionType);

        // Setup state
        this.state = {
            messages: [],
            messageOnClick: null,

            //the countdown until this notice closes
            maxCountdownTime,

            playback,
            showSkipButton: [true, true],

            editing: false,
            choosingCategory: false,
            thanksForVotingText: null,

            actionState: SkipNoticeAction.None,

            // Keep track of what segment the user interacted with.
            voted: new Array(this.props.segments.length).fill(SkipNoticeAction.None),
            copied: new Array(this.props.segments.length).fill(SkipNoticeAction.None),

            speedUpPaused: false,
        };
    }

    render(): React.ReactElement {
        const firstColumn = <>
            {this.getSkipButton(0)}
            {(this.isSpeedUpForCurrentSegment() || this.state.speedUpPaused) && this.getSpeedUpControlButton()}
        </>;

        return (
            <StackNoticeComponent
                noticeTitle={this.props.advanceSkipNotice
                    ? getAdvanceSkipText(this.segments, this.state.playback[0] === SegmentPlaybackState.Skipped)
                    : getSkippingText(this.segments, this.hasSkipped())}
                idSuffix={this.idSuffix}
                startFaded={this.isFadedNotice()}
                maxCountdownTime={this.state.maxCountdownTime}
                ref={this.noticeRef}
                closeListener={() => this.closeListener()}
                onInteractionChange={this.props.onInteractionChange}
                playbackEnd={this.props.autoSkip ? undefined : getSpeedUpNoticeEnd(this.segments)}
                dismissalPaused={this.state.speedUpPaused}
                upcomingStart={this.props.advanceSkipNotice ? this.segments[0].segment[0] : undefined}
                smaller={this.isSmallNotice()}
                compact={this.state.compact}
                logoFill={Config.config.barTypes[this.segments[0].category].color}
                firstColumn={firstColumn}
                bottomRow={[...this.getMessageBoxes(), ...this.getBottomRow()]}
            ></StackNoticeComponent>
        );
    }

    private hasSkipped(): boolean {
        return !this.props.advanceSkipNotice && this.state.playback[0] === SegmentPlaybackState.Skipped;
    }

    private isSmallNotice(): boolean {
        return noticePresentation(Config.config.noticeVisibilityMode, !!this.props.advanceSkipNotice, this.state.playback[0]).small;
    }

    private isFadedNotice(): boolean {
        return noticePresentation(Config.config.noticeVisibilityMode, !!this.props.advanceSkipNotice, this.state.playback[0]).faded;
    }

    componentDidMount(): void {
        this.configListener = (changes) => {
            if ("noticeVisibilityMode" in changes) {
                this.forceUpdate();
                setStackCardExpanded(this.noticeRef.current?.getElement().current, !this.isSmallNotice());
            }
            if ("barTypes" in changes) this.forceUpdate();
        };
        Config.configSyncListeners.push(this.configListener);
        this.video = getVideo();
        this.video?.addEventListener("timeupdate", this.expirePending);
        this.video?.addEventListener("seeking", this.expirePending);
        const player = this.noticeRef.current?.getElement().current?.closest(".bpx-player-video-area");
        if (player) {
            const updateLayout = () => {
                const { width, height } = player.getBoundingClientRect();
                if (width <= 0 || height <= 0) return;
                const compact = width <= 480 || height <= 270;
                if (compact !== this.state.compact) this.setState({ compact });
            };
            updateLayout();
            this.playerResizeObserver = new ResizeObserver(updateLayout);
            this.playerResizeObserver.observe(player);
        }
        // 快进状态变化（外部取消/恢复/结束）时刷新按钮显隐，避免“恢复快进”按钮永久滞留
        getContentApp().bus.on(CONTENT_EVENTS.SPEEDUP_STATE_CHANGED, this.onSpeedUpStateChanged);
    }

    componentWillUnmount(): void {
        this.playerResizeObserver?.disconnect();
        this.video?.removeEventListener("timeupdate", this.expirePending);
        this.video?.removeEventListener("seeking", this.expirePending);
        this.clearConfigListener();
        getContentApp().bus.off(CONTENT_EVENTS.SPEEDUP_STATE_CHANGED, this.onSpeedUpStateChanged);
    }

    onSpeedUpStateChanged = (): void => {
        if (this.state.speedUpPaused && !this.isSpeedUpForCurrentSegment() && !getActiveSpeedUpInfo()) {
            // 快进已被外部路径取消（非用户暂停流程），退出“已暂停”显示
            this.setState({ speedUpPaused: false });
            return;
        }
        // 触发重渲染以重新计算 isSpeedUpForCurrentSegment()（该读取非响应式）
        this.forceUpdate();
    };

    getBottomRow(): JSX.Element[] {
        return [
            /* Bottom Row */
            <tr id={"sponsorSkipNoticeSecondRow" + this.idSuffix} key={0}>
                {/* Vote Button Container */}
                {!this.state.thanksForVotingText ? (
                    <td
                        id={"sponsorTimesVoteButtonsContainer" + this.idSuffix}
                        className="sponsorTimesVoteButtonsContainer"
                    >
                        {/* Upvote Button */}
                        <button
                            type="button"
                            id={"sponsorTimesDownvoteButtonsContainerUpvote" + this.idSuffix}
                            className="voteButton"
                            style={{ marginRight: "5px" }}
                            title={chrome.i18n.getMessage("upvoteButtonInfo")}
                            aria-label={chrome.i18n.getMessage("upvoteButtonInfo")}
                            onClick={() => this.prepAction(SkipNoticeAction.Upvote)}
                        >
                            <ThumbsUpSvg
                                fill={
                                    this.state.actionState === SkipNoticeAction.Upvote
                                        ? this.selectedColor
                                        : this.unselectedColor
                                }
                            />
                        </button>

                        {/* Report Button */}
                        <button
                            type="button"
                            id={"sponsorTimesDownvoteButtonsContainerDownvote" + this.idSuffix}
                            className="voteButton"
                            style={{ marginRight: "5px", marginLeft: "5px" }}
                            title={chrome.i18n.getMessage("reportButtonInfo")}
                            aria-label={chrome.i18n.getMessage("reportButtonInfo")}
                            onClick={() => this.prepAction(SkipNoticeAction.Downvote)}
                        >
                            <ThumbsDownSvg
                                fill={downvoteButtonColor(
                                    this.segments,
                                    this.state.actionState,
                                    SkipNoticeAction.Downvote
                                )}
                            />
                        </button>

                        {/* Copy and Downvote Button */}
                        <button
                            type="button"
                            id={"sponsorTimesDownvoteButtonsContainerCopyDownvote" + this.idSuffix}
                            className="voteButton"
                            style={{ marginLeft: "5px" }}
                            aria-label={chrome.i18n.getMessage("edit")}
                            onClick={() => this.openEditingOptions()}
                        >
                            <PencilSvg
                                fill={
                                    this.state.editing === true ||
                                    this.state.actionState === SkipNoticeAction.CopyDownvote ||
                                    this.state.choosingCategory === true
                                        ? this.selectedColor
                                        : this.unselectedColor
                                }
                            />
                        </button>
                    </td>
                ) : (
                    <td
                        id={"sponsorTimesVoteButtonInfoMessage" + this.idSuffix}
                        className="sponsorTimesInfoMessage sponsorTimesVoteButtonMessage"
                        style={{ marginRight: "10px" }}
                    >
                        {/* Submitted string */}
                        <span style={{ marginRight: "10px" }}>{this.state.thanksForVotingText}</span>

                        {/* Continue Voting Button */}
                        <button
                            id={"sponsorTimesContinueVotingContainer" + this.idSuffix}
                            className="sponsorSkipObject sponsorSkipNoticeButton"
                            title={"Continue Voting"}
                            onClick={() =>
                                this.setState({
                                    thanksForVotingText: null,
                                    messages: [],
                                })
                            }
                        >
                            {chrome.i18n.getMessage("ContinueVoting")}
                        </button>
                    </td>
                )}

                {/* Unskip/Skip Button */}
                {this.segments[0].actionType === ActionType.Mute ? <td>{this.getSkipButton(1)}</td> : null}

                {/* Never show button */}
                {!this.props.autoSkip || this.props.startReskip ? (
                    ""
                ) : (
                    <td className="sponsorSkipNoticeRightSection" key={1}>
                        <button
                            className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton"
                            onClick={this.contentContainer().dontShowNoticeAgain}
                        >
                            {chrome.i18n.getMessage("Hide")}
                        </button>
                    </td>
                )}
            </tr>,
            /* Edit Segments Row */
            this.state.editing &&
                !this.state.thanksForVotingText &&
                !(this.state.choosingCategory || this.state.actionState === SkipNoticeAction.CopyDownvote) && (
                    <tr id={"sponsorSkipNoticeEditSegmentsRow" + this.idSuffix} key={2}>
                        <td id={"sponsorTimesEditSegmentsContainer" + this.idSuffix}>
                            {/* Copy Segment */}
                            <button
                                className="sponsorSkipObject sponsorSkipNoticeButton"
                                title={chrome.i18n.getMessage("CopyDownvoteButtonInfo")}
                                style={{
                                    color: downvoteButtonColor(
                                        this.segments,
                                        this.state.actionState,
                                        SkipNoticeAction.Downvote
                                    ),
                                }}
                                onClick={() => this.prepAction(SkipNoticeAction.CopyDownvote)}
                            >
                                {chrome.i18n.getMessage("CopyAndDownvote")}
                            </button>

                            {/* Category vote */}
                            <button
                                className="sponsorSkipObject sponsorSkipNoticeButton"
                                title={chrome.i18n.getMessage("ChangeCategoryTooltip")}
                                style={{
                                    color:
                                        this.state.actionState === SkipNoticeAction.CategoryVote &&
                                        this.state.editing == true
                                            ? this.selectedColor
                                            : this.unselectedColor,
                                }}
                                onClick={() => this.resetStateToStart(SkipNoticeAction.CategoryVote, true, true)}
                            >
                                {chrome.i18n.getMessage("incorrectCategory")}
                            </button>
                        </td>
                    </tr>
                ),
            /* Category Chooser Row */
            this.state.choosingCategory && !this.state.thanksForVotingText && (
                <tr id={"sponsorSkipNoticeCategoryChooserRow" + this.idSuffix} key={3}>
                    <td>
                        {/* Category Selector */}
                        <select
                            id={"sponsorTimeCategories" + this.idSuffix}
                            className="sponsorTimeCategories sponsorTimeEditSelector"
                            defaultValue={this.segments[0].category}
                            onMouseDown={(e) => e.stopPropagation()}
                            ref={this.categoryOptionRef}
                        >
                            {this.getCategoryOptions()}
                        </select>

                        {/* Submit Button */}
                        {this.segments.length === 1 && (
                            <button
                                className="sponsorSkipObject sponsorSkipNoticeButton"
                                onClick={() => this.prepAction(SkipNoticeAction.CategoryVote)}
                            >
                                {chrome.i18n.getMessage("submit")}
                            </button>
                        )}
                    </td>
                </tr>
            ),
            /* Segment Chooser Row */
            this.state.actionState !== SkipNoticeAction.None &&
                this.segments.length > 1 &&
                !this.state.thanksForVotingText && (
                    <tr id={"sponsorSkipNoticeSubmissionOptionsRow" + this.idSuffix} key={4}>
                        <td id={"sponsorTimesSubmissionOptionsContainer" + this.idSuffix}>
                            {this.getSubmissionChooser()}
                        </td>
                    </tr>
                ),
        ];
    }

    getSkipButton(buttonIndex: number): JSX.Element {
        if (
            this.state.showSkipButton[buttonIndex] &&
            (this.segments.length > 1 || this.segments[0].actionType !== ActionType.Poi || this.props.unskipTime)
        ) {
            const forceSeek = buttonIndex === 1 && this.segments[0].actionType === ActionType.Mute;

            const style: React.CSSProperties = {
                marginLeft: "4px",
                color: [SkipNoticeAction.Unskip0, SkipNoticeAction.Unskip1].includes(this.state.actionState)
                    ? this.selectedColor
                    : this.unselectedColor,
            };

            return (
                <span
                    className="sponsorSkipNoticeUnskipSection"
                >
                    <button
                        id={"sponsorSkipUnskipButton" + this.idSuffix + "-" + buttonIndex}
                        className="sponsorSkipObject sponsorSkipNoticeButton"
                        style={style}
                        onClick={() =>
                            this.prepAction(buttonIndex === 1 ? SkipNoticeAction.Unskip1 : SkipNoticeAction.Unskip0)
                        }
                    >
                        {this.getSkipButtonText(buttonIndex, forceSeek ? ActionType.Skip : null) +
                            (!this.state.compact && !forceSeek && this.props.showKeybindHint
                                ? " (" + keybindToString(Config.config.skipKeybind) + ")"
                                : "")}
                    </button>
                </span>
            );
        }
        return null;
    }

    /** 当前 notice 的片段是否正处于倍速快进中 */
    isSpeedUpForCurrentSegment(): boolean {
        const activeInfo = getActiveSpeedUpInfo();
        return !this.props.autoSkip && !!activeInfo && noticeSegmentsIntersect(activeInfo.segments, this.segments);
    }

    /** 顶行快进控制按钮*/
    getSpeedUpControlButton(): JSX.Element {
        const isPaused = this.state.speedUpPaused;
        return (
            <span className="sponsorSkipNoticeUnskipSection" style={{ marginLeft: "4px" }}>
                <button
                    id={"sponsorSkipPauseSpeedUpButton" + this.idSuffix}
                    className="sponsorSkipObject sponsorSkipNoticeButton"
                    onClick={() => (isPaused ? this.resumeSpeedUp() : this.pauseSpeedUp())}
                >
                    {chrome.i18n.getMessage(isPaused ? "resumeSpeedUp" : "pauseSpeedUp")}
                </button>
            </span>
        );
    }

    /** 暂停快进：恢复原始倍速*/
    pauseSpeedUp(): void {
        void cancelSpeedUp(true, true);
        this.setState({ speedUpPaused: true });

    }

    /** 恢复快进：重新以快进倍速播放 */
    async resumeSpeedUp(): Promise<void> {
        // 清除手动取消标记，允许同一片段重新快进
        for (const seg of this.segments) {
            clearManuallyCancelled(seg);
        }
        const skipTime = [this.segments[0].segment[0], this.segments[this.segments.length - 1].segment[1]];
        const resumed = await startSpeedUp(this.segments, skipTime as [number, number]);
        if (!resumed) {
            // 启动被拒绝（冷却期/近结尾等）：保持“恢复快进”按钮，不假恢复、不重启倒计时
            return;
        }
        this.setState({ speedUpPaused: false });

    }

    getSubmissionChooser(): JSX.Element[] {
        const elements: JSX.Element[] = [];
        for (let i = 0; i < this.segments.length; i++) {
            elements.push(
                <button
                    className="sponsorSkipObject sponsorSkipNoticeButton"
                    style={{ opacity: this.getSubmissionChooserOpacity(i), color: this.getSubmissionChooserColor(i) }}
                    onClick={() => this.performAction(i)}
                    autoFocus={i == 0}
                    key={"submission" + i + this.segments[i].category + this.idSuffix}
                >
                    {`${i + 1}. ${chrome.i18n.getMessage("category_" + this.segments[i].category)} (${getFormattedTime(
                        this.segments[i].segment[0]
                    )})`}
                </button>
            );
        }
        return elements;
    }

    getSubmissionChooserOpacity(index: number): number {
        const isUpvote = this.state.actionState === SkipNoticeAction.Upvote;
        const isDownvote = this.state.actionState == SkipNoticeAction.Downvote;
        const isCopyDownvote = this.state.actionState == SkipNoticeAction.CopyDownvote;
        const shouldBeGray: boolean =
            (isUpvote && this.state.voted[index] == SkipNoticeAction.Upvote) ||
            (isDownvote && this.state.voted[index] == SkipNoticeAction.Downvote) ||
            (isCopyDownvote && this.state.copied[index] == SkipNoticeAction.CopyDownvote);

        return shouldBeGray ? 0.35 : 1;
    }

    getSubmissionChooserColor(index: number): string {
        const isDownvote = this.state.actionState == SkipNoticeAction.Downvote;
        const isCopyDownvote = this.state.actionState == SkipNoticeAction.CopyDownvote;
        const shouldWarnUser =
            Config.config.isVip && (isDownvote || isCopyDownvote) && this.segments[index].locked === 1;

        return shouldWarnUser ? this.lockedColor : this.unselectedColor;
    }

    componentDidUpdate(previousProps: SkipNoticeProps, previous: SkipNoticeState): void {
        if (previousProps.revision !== this.props.revision) {
            const mute = this.segments[0].actionType === ActionType.Mute;
            this.setState({
                playback: initialPlayback(this.props.autoSkip, this.props.startReskip, this.segments[0].actionType),
                speedUpPaused: false,
                showSkipButton: [true, true],
                maxCountdownTime: mute || !this.props.autoSkip ? this.getFullDurationCountdown(0) : () => Config.config.skipNoticeDuration,
                voted: this.segments.map(segment => previous.voted[previousProps.segments.findIndex(old => old.UUID === segment.UUID)] ?? SkipNoticeAction.None),
                copied: this.segments.map(segment => previous.copied[previousProps.segments.findIndex(old => old.UUID === segment.UUID)] ?? SkipNoticeAction.None),
            }, () => this.noticeRef.current?.resetCountdown());
        }
        if (previous.playback !== this.state.playback || previousProps.advanceSkipNotice !== this.props.advanceSkipNotice) {
            setStackCardExpanded(this.noticeRef.current?.getElement().current, !this.isSmallNotice());
        }
        if ((this.state.editing && !previous.editing) ||
            (this.state.actionState !== SkipNoticeAction.None && this.state.actionState !== previous.actionState) ||
            this.state.messages !== previous.messages || this.state.thanksForVotingText !== previous.thanksForVotingText) {
            expandStackCard(this.noticeRef.current?.getElement().current);
        }
    }

    getMessageBoxes(): JSX.Element[] {
        if (this.state.messages.length === 0) {
            // Add a spacer if there is no text
            return [
                <tr
                    id={"sponsorSkipNoticeSpacer" + this.idSuffix}
                    className="sponsorBlockSpacer"
                    key={"messageBoxSpacer"}
                ></tr>,
            ];
        }

        const elements: JSX.Element[] = [];

        for (let i = 0; i < this.state.messages.length; i++) {
            elements.push(
                <tr key={i + "_messageBox"}>
                    <td key={i + "_messageBox"}>
                        <NoticeTextSelectionComponent
                            idSuffix={this.idSuffix}
                            text={this.state.messages[i]}
                            onClick={this.state.messageOnClick}
                            key={i + "_messageBox"}
                        ></NoticeTextSelectionComponent>
                    </td>
                </tr>
            );
        }

        return elements;
    }

    prepAction(action: SkipNoticeAction): void {
        if (this.segments.length === 1) {
            this.performAction(0, action);
        } else {
            expandStackCard(this.noticeRef.current?.getElement().current);
            this.noticeRef.current.resetCountdown();

            switch (action ?? this.state.actionState) {
                case SkipNoticeAction.None:
                    this.resetStateToStart();
                    break;
                case SkipNoticeAction.Upvote:
                    this.resetStateToStart(SkipNoticeAction.Upvote);
                    break;
                case SkipNoticeAction.Downvote:
                    this.resetStateToStart(SkipNoticeAction.Downvote);
                    break;
                case SkipNoticeAction.CategoryVote:
                    this.resetStateToStart(SkipNoticeAction.CategoryVote, true, true);
                    break;
                case SkipNoticeAction.CopyDownvote:
                    this.resetStateToStart(SkipNoticeAction.CopyDownvote, true);
                    break;
                case SkipNoticeAction.Unskip0:
                    this.resetStateToStart(SkipNoticeAction.Unskip0);
                    break;
                case SkipNoticeAction.Unskip1:
                    this.resetStateToStart(SkipNoticeAction.Unskip1);
                    break;
            }
        }
    }

    /**
     * Performs the action from the current state
     *
     * @param index
     */
    performAction(index: number, action?: SkipNoticeAction): void {
        switch (action ?? this.state.actionState) {
            case SkipNoticeAction.None:
                this.noAction(index);
                break;
            case SkipNoticeAction.Upvote:
                this.upvote(index);
                break;
            case SkipNoticeAction.Downvote:
                this.downvote(index);
                break;
            case SkipNoticeAction.CategoryVote:
                this.categoryVote(index);
                break;
            case SkipNoticeAction.CopyDownvote:
                this.copyDownvote(index);
                break;
            case SkipNoticeAction.Unskip0:
                this.unskipAction(0, index, false);
                break;
            case SkipNoticeAction.Unskip1:
                this.unskipAction(1, index, true);
                break;
            default:
                this.resetStateToStart();
                break;
        }
    }

    noAction(index: number): void {
        const voted = this.state.voted;
        voted[index] = SkipNoticeAction.None;

        this.setState({
            voted,
        });
    }

    upvote(index: number): void {
        if (this.segments.length === 1) this.resetStateToStart();
        this.contentContainer().vote(1, this.segments[index].UUID, undefined, this);
    }

    downvote(index: number): void {
        if (this.segments.length === 1) this.resetStateToStart();

        this.contentContainer().vote(0, this.segments[index].UUID, undefined, this);
    }

    categoryVote(index: number): void {
        this.contentContainer().vote(
            undefined,
            this.segments[index].UUID,
            this.categoryOptionRef.current.value as Category,
            this
        );
    }

    copyDownvote(index: number): void {
        const sponsorTimesSubmitting: SponsorTime = {
            cid: getCid(),
            segment: this.segments[index].segment,
            UUID: generateUserID() as SegmentUUID,
            category: this.segments[index].category,
            actionType: this.segments[index].actionType,
            source: SponsorSourceType.Local,
        };

        this.props.contentContainer().addSubmittingSegment(sponsorTimesSubmitting);
        this.props.contentContainer().resetSponsorSubmissionNotice();

        this.contentContainer().vote(0, this.segments[index].UUID, undefined, this);

        const copied = this.state.copied;
        copied[index] = SkipNoticeAction.CopyDownvote;

        this.setState({
            copied,
        });
    }

    unskipAction(buttonIndex: number, index: number, forceSeek: boolean): void {
        if (this.state.playback[buttonIndex] === SegmentPlaybackState.Skipped) this.unskip(buttonIndex, index, forceSeek);
        else this.reskip(buttonIndex, index, forceSeek);
    }

    openEditingOptions(): void {
        this.resetStateToStart(undefined, true);
    }

    getCategoryOptions(): React.ReactElement[] {
        const elements = [];

        const categories = CompileConfig.categoryList.filter((cat) =>
            CompileConfig.categorySupport[cat].includes(ActionType.Skip)
        ) as Category[];
        for (const category of categories) {
            elements.push(
                <option value={category} key={category} className={this.getCategoryNameClass(category)}>
                    {chrome.i18n.getMessage("category_" + category)}
                </option>
            );
        }
        return elements;
    }

    getCategoryNameClass(category: string): string {
        return this.props.contentContainer().lockedCategories.includes(category) ? "sponsorBlockLockedColor" : "";
    }

    unskip(buttonIndex: number, index: number, forceSeek: boolean): void {
        if (this.props.advanceSkipNotice && getVideo().currentTime < this.segments[0].segment[0]) {
            upcomingSkipDecision.set(`${getVideoID()}:${getCid()}`, this.segments.map(segment => segment.UUID), false);
        } else {
            this.contentContainer().unskipSponsorTime(this.segments[index], this.props.unskipTime, forceSeek);
        }

        this.unskippedMode(buttonIndex, index, SegmentPlaybackState.Undone);
    }

    reskip(buttonIndex: number, index: number, forceSeek: boolean): void {
        if (this.props.advanceSkipNotice && getVideo().currentTime < this.segments[0].segment[0]) {
            upcomingSkipDecision.set(`${getVideoID()}:${getCid()}`, this.segments.map(segment => segment.UUID), true);
        } else {
            this.contentContainer().reskipSponsorTime(this.segments[index], forceSeek);
        }

        const playback = [...this.state.playback];
        playback[buttonIndex] = SegmentPlaybackState.Skipped;

        const newState: SkipNoticeState = {
            playback,
            speedUpPaused: false,

            maxCountdownTime: () => Config.config.skipNoticeDuration,
        };

        //reset countdown
        this.setState(newState, () => {
            this.noticeRef.current.resetCountdown();
        });
    }

    /** Sets up notice to be not skipped yet */
    unskippedMode(buttonIndex: number, index: number, skipButtonState: SegmentPlaybackState): void {
        // Update playback and explicitly restart the result display time.
        this.setState(this.getUnskippedModeInfo(buttonIndex, index, skipButtonState), () => {
            this.noticeRef.current.resetCountdown();
        });
    }

    getUnskippedModeInfo(buttonIndex: number, index: number, playbackState: SegmentPlaybackState): SkipNoticeState {
        const changeCountdown = this.segments[index].actionType !== ActionType.Poi;

        const maxCountdownTime = changeCountdown ? this.getFullDurationCountdown(index) : this.state.maxCountdownTime;

        const playback = [...this.state.playback];
        playback[buttonIndex] = playbackState;
        if (buttonIndex === 1) {
            // Undoing a mute segment's seek also makes its mute action available again.
            playback[0] = SegmentPlaybackState.Undone;
        }

        return {
            playback,
            speedUpPaused: false,
            // change max duration to however much of the sponsor is left
            maxCountdownTime,
            showSkipButton: buttonIndex === 1 ? [true, true] : this.state.showSkipButton,
        } as SkipNoticeState;
    }

    getFullDurationCountdown(index: number): () => number {
        return () => {
            const sponsorTime = this.segments[index];
            const video = getVideo();
            if (!video) return Config.config.skipNoticeDuration;
            const duration = Math.round(
                (sponsorTime.segment[1] - video.currentTime) * (1 / video.playbackRate)
            );

            return Math.max(duration, Config.config.skipNoticeDuration);
        };
    }

    afterVote(segment: SponsorTime, type: number, category: Category): void {
        const index = utils.getSponsorIndexFromUUID(this.segments, segment.UUID);
        const wikiLinkText = CompileConfig.wikiLinks[segment.category];

        const voted = this.state.voted;
        switch (type) {
            case 0:
                this.clearConfigListener();
                this.setNoticeInfoMessageWithOnClick(
                    () => window.open(wikiLinkText),
                    chrome.i18n.getMessage("OpenCategoryWikiPage")
                );

                voted[index] = SkipNoticeAction.Downvote;
                break;
            case 1:
                voted[index] = SkipNoticeAction.Upvote;
                break;
            case 20:
                voted[index] = SkipNoticeAction.None;
                break;
        }

        this.setState({
            voted,
        });

        this.addVoteButtonInfo(chrome.i18n.getMessage("voted"));

        if (segment && category) {
            // This is the segment inside the skip notice
            this.segments[index].category = category;
        }
    }

    setNoticeInfoMessageWithOnClick(onClick: (event: React.MouseEvent) => unknown, ...messages: string[]): void {
        this.setState({
            messages,
            messageOnClick: (event) => onClick(event),
        });
    }

    setNoticeInfoMessage(...messages: string[]): void {
        this.setState({
            messages,
        });
    }

    addVoteButtonInfo(message: string): void {
        this.setState({
            thanksForVotingText: message,
        });
    }

    resetVoteButtonInfo(): void {
        this.setState({
            thanksForVotingText: null,
        });
    }

    closeListener(): void {
        this.clearConfigListener();

        this.props.closeListener();
    }

    clearConfigListener(): void {
        if (this.configListener) {
            Config.configSyncListeners.splice(Config.configSyncListeners.indexOf(this.configListener), 1);
            this.configListener = null;
        }
    }

    unmutedListener(time: number): void {
        if (
            this.state.showSkipButton[0] && this.props.segments.length === 1 &&
            this.props.segments[0].actionType === ActionType.Mute &&
            time >= this.props.segments[0].segment[1]
        ) {
            this.setState({
                showSkipButton: [false, true],
            }, this.props.onInteractionChange);
        }
    }

    resetStateToStart(
        actionState: SkipNoticeAction = SkipNoticeAction.None,
        editing = false,
        choosingCategory = false
    ): void {
        this.setState({
            actionState: actionState,
            editing: editing,
            choosingCategory: choosingCategory,
            thanksForVotingText: null,
            messages: [],
        });
    }

    private getSkipButtonText(buttonIndex: number, forceType?: ActionType): string {
        switch (this.state.playback[buttonIndex]) {
            case SegmentPlaybackState.Skipped:
                return this.getUndoText(forceType);
            case SegmentPlaybackState.Undone:
                return this.getRedoText(forceType);
            case SegmentPlaybackState.Pending:
                return this.getStartText(forceType);
        }
    }

    private getUndoText(forceType?: ActionType): string {
        const actionType = forceType || this.segments[0].actionType;
        switch (actionType) {
            case ActionType.Mute: {
                return chrome.i18n.getMessage("unmute");
            }
            case ActionType.Skip:
            default: {
                return chrome.i18n.getMessage("unskip");
            }
        }
    }

    private getRedoText(forceType?: ActionType): string {
        const actionType = forceType || this.segments[0].actionType;
        switch (actionType) {
            case ActionType.Mute: {
                return chrome.i18n.getMessage("mute");
            }
            case ActionType.Skip:
            default: {
                return chrome.i18n.getMessage("reskip");
            }
        }
    }

    private getStartText(forceType?: ActionType): string {
        const actionType = forceType || this.segments[0].actionType;
        switch (actionType) {
            case ActionType.Mute: {
                return chrome.i18n.getMessage("mute");
            }
            case ActionType.Skip:
            default: {
                return chrome.i18n.getMessage("skip");
            }
        }
    }
}

export default SkipNoticeComponent;
