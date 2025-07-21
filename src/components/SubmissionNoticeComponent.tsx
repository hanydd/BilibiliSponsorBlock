import * as React from "react";
import * as CompileConfig from "../../config.json";
import Config from "../config";
import GenericNotice from "../render/GenericNotice";
import { Category } from "../types";

import { ConfigProvider, Popover, theme } from "antd";
import { keybindToString } from "../config/config";
import { ContentContainer } from "../ContentContainerTypes";
import { showMessage } from "../render/MessageNotice";
import { getGuidelineInfo } from "../utils/constants";
import { exportTimes } from "../utils/exporter";
import { getVideo } from "../utils/video";
import NoticeComponent from "./NoticeComponent";
import NoticeTextSelectionComponent from "./NoticeTextSectionComponent";
import SponsorTimeEditComponent from "./SponsorTimeEditComponent";

export interface SubmissionNoticeProps {
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    callback: () => Promise<boolean>;

    closeListener: () => void;
}

export interface SubmissionNoticeState {
    noticeTitle: string;
    messages: string[];
    idSuffix: string;
    popoverOpen: boolean;
}

class SubmissionNoticeComponent extends React.Component<SubmissionNoticeProps, SubmissionNoticeState> {
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    callback: () => unknown;

    noticeRef: React.MutableRefObject<NoticeComponent>;
    timeEditRefs: React.RefObject<SponsorTimeEditComponent>[];

    videoObserver: MutationObserver;

    guidelinesReminder: GenericNotice;

    lastSegmentCount: number;

    constructor(props: SubmissionNoticeProps) {
        super(props);
        this.noticeRef = React.createRef();

        this.contentContainer = props.contentContainer;
        this.callback = props.callback;

        const noticeTitle = chrome.i18n.getMessage("confirmNoticeTitle");

        this.lastSegmentCount = this.props.contentContainer().sponsorTimesSubmitting.length;

        // Setup state
        this.state = {
            noticeTitle,
            messages: [],
            idSuffix: "SubmissionNotice",
            popoverOpen: Config.config.showShortcutPopover,
        };
    }

    componentDidMount(): void {
        // Catch and rerender when the video size changes
        //TODO: Use ResizeObserver when it is supported in TypeScript
        this.videoObserver = new MutationObserver(() => {
            this.forceUpdate();
        });

        this.videoObserver.observe(getVideo(), {
            attributes: true,
        });

        // Prevent zooming while changing times
        document.getElementById("sponsorSkipNoticeMiddleRow" + this.state.idSuffix).addEventListener(
            "wheel",
            function (event) {
                if (event.ctrlKey) {
                    event.preventDefault();
                }
            },
            { passive: false }
        );
    }

    componentWillUnmount(): void {
        if (this.videoObserver) {
            this.videoObserver.disconnect();
        }
    }

    componentDidUpdate() {
        const currentSegmentCount = this.props.contentContainer().sponsorTimesSubmitting.length;
        if (currentSegmentCount > this.lastSegmentCount) {
            this.lastSegmentCount = currentSegmentCount;

            this.scrollToBottom();
        }
    }

    scrollToBottom() {
        const scrollElement = this.noticeRef.current
            .getElement()
            .current.querySelector("#sponsorSkipNoticeMiddleRowSubmissionNotice");
        scrollElement.scrollTo({
            top: scrollElement.scrollHeight + 1000,
        });
    }

    render(): React.ReactElement {
        const sortButton = (
            <img
                id={"sponsorSkipSortButton" + this.state.idSuffix}
                className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipSmallButton"
                onClick={() => this.sortSegments()}
                title={chrome.i18n.getMessage("sortSegments")}
                key="sortButton"
                src={chrome.runtime.getURL("icons/sort.svg")}
            ></img>
        );
        const exportButton = (
            <img
                id={"sponsorSkipExportButton" + this.state.idSuffix}
                className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipSmallButton"
                onClick={() => this.exportSegments()}
                title={chrome.i18n.getMessage("exportSegments")}
                key="exportButton"
                src={chrome.runtime.getURL("icons/export.svg")}
            ></img>
        );
        return (
            <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
                <Popover
                    content={this.popoverContent}
                    open={this.state.popoverOpen}
                    getPopupContainer={() => document.querySelector("#bilibili-player .bpx-player-container")}
                    autoAdjustOverflow={false}
                >
                    <NoticeComponent
                        noticeTitle={this.state.noticeTitle}
                        idSuffix={this.state.idSuffix}
                        ref={this.noticeRef}
                        closeListener={this.cancel.bind(this)}
                        zIndex={5000}
                        firstColumn={[sortButton, exportButton]}
                        advanceSkipNoticeShow={false}
                    >
                        {/* Text Boxes */}
                        {this.getMessageBoxes()}

                        {/* Sponsor Time List */}
                        <tr
                            id={"sponsorSkipNoticeMiddleRow" + this.state.idSuffix}
                            className="sponsorTimeMessagesRow"
                            style={{ maxHeight: getVideo()?.offsetHeight - 200 + "px" }}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <td style={{ width: "100%" }}>{this.getSponsorTimeMessages()}</td>
                        </tr>

                        {/* Last Row */}
                        <tr id={"sponsorSkipNoticeSecondRow" + this.state.idSuffix}>
                            <td className="sponsorSkipNoticeRightSection" style={{ position: "relative" }}>
                                {/* Guidelines button */}
                                <button
                                    className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton"
                                    onClick={() => window.open("https://github.com/hanydd/BilibiliSponsorBlock/wiki/Submitting%20tips")}
                                >
                                    {chrome.i18n.getMessage(
                                        Config.config.submissionCountSinceCategories > 3
                                            ? "guidelines"
                                            : "readTheGuidelines"
                                    )}
                                </button>

                                {/* Submit Button */}
                                <button
                                    className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton"
                                    {...(Config.config.actuallySubmitKeybind && {
                                        title: `${chrome.i18n.getMessage("submit")} (${keybindToString(
                                            Config.config.actuallySubmitKeybind
                                        )})`,
                                    })}
                                    onClick={this.submit.bind(this)}
                                >
                                    {chrome.i18n.getMessage("submit")}
                                </button>
                            </td>
                        </tr>
                    </NoticeComponent>
                </Popover>
            </ConfigProvider>
        );
    }

    getSponsorTimeMessages(): JSX.Element[] | JSX.Element {
        const elements: JSX.Element[] = [];
        this.timeEditRefs = [];

        const sponsorTimes = this.props.contentContainer().sponsorTimesSubmitting;

        for (let i = 0; i < sponsorTimes.length; i++) {
            const timeRef = React.createRef<SponsorTimeEditComponent>();

            elements.push(
                <SponsorTimeEditComponent
                    key={sponsorTimes[i].UUID}
                    idSuffix={this.state.idSuffix + i}
                    index={i}
                    contentContainer={this.props.contentContainer}
                    submissionNotice={this}
                    categoryChangeListener={this.categoryChangeListener.bind(this)}
                    ref={timeRef}
                ></SponsorTimeEditComponent>
            );

            this.timeEditRefs.push(timeRef);
        }

        return elements;
    }

    getMessageBoxes(): JSX.Element[] | JSX.Element {
        const elements: JSX.Element[] = [];

        for (let i = 0; i < this.state.messages.length; i++) {
            elements.push(
                <NoticeTextSelectionComponent
                    idSuffix={this.state.idSuffix + i}
                    text={this.state.messages[i]}
                    key={i}
                ></NoticeTextSelectionComponent>
            );
        }

        return elements;
    }

    cancel(): void {
        this.guidelinesReminder?.close();
        this.noticeRef.current.close(true);

        this.contentContainer().resetSponsorSubmissionNotice(false);

        this.props.closeListener();
    }

    submit(): void {
        // save all items
        for (const ref of this.timeEditRefs) {
            ref.current.saveEditTimes();
        }

        const sponsorTimesSubmitting = this.props.contentContainer().sponsorTimesSubmitting;
        for (const sponsorTime of sponsorTimesSubmitting) {
            if (sponsorTime.category === "chooseACategory") {
                showMessage(chrome.i18n.getMessage("youMustSelectACategory"), "warning");
                return;
            }
        }

        // Check if any non music categories are being used on a music video
        if (this.contentContainer().videoInfo?.microformat?.playerMicroformatRenderer?.category === "Music") {
            for (const sponsorTime of sponsorTimesSubmitting) {
                if (sponsorTime.category === "sponsor") {
                    if (!confirm(chrome.i18n.getMessage("nonMusicCategoryOnMusic"))) return;

                    break;
                }
            }
        }

        this.props.callback().then((success) => {
            if (success) {
                this.cancel();
            }
        });
    }

    sortSegments(): void {
        let sponsorTimesSubmitting = this.props.contentContainer().sponsorTimesSubmitting;
        sponsorTimesSubmitting = sponsorTimesSubmitting.sort((a, b) => a.segment[0] - b.segment[0]);

        Config.local.unsubmittedSegments[this.props.contentContainer().sponsorVideoID] = sponsorTimesSubmitting;
        Config.forceLocalUpdate("unsubmittedSegments");

        this.forceUpdate();
    }

    exportSegments() {
        const sponsorTimesSubmitting = this.props
            .contentContainer()
            .sponsorTimesSubmitting.sort((a, b) => a.segment[0] - b.segment[0]);
        window.navigator.clipboard.writeText(exportTimes(sponsorTimesSubmitting));

        new GenericNotice(null, "exportCopied", {
            title: chrome.i18n.getMessage(`CopiedExclamation`),
            timed: true,
            maxCountdownTime: () => 0.6,
            referenceNode: document.querySelector(".noticeLeftIcon"),
            dontPauseCountdown: true,
            style: {
                top: 0,
                bottom: 0,
                minWidth: 0,
                right: "30px",
                margin: "auto",
            },
            hideLogo: true,
            hideRightInfo: true,
            extraClass: "exportCopiedNotice",
        });
    }

    categoryChangeListener(index: number, category: Category): void {
        const dialogWidth = this.noticeRef?.current?.getElement()?.current?.offsetWidth;
        if (
            category !== "chooseACategory" &&
            Config.config.showCategoryGuidelines &&
            getVideo().offsetWidth > dialogWidth * 2
        ) {
            const options = {
                title: chrome.i18n.getMessage(`category_${category}`),
                textBoxes: getGuidelineInfo(category),
                buttons: [
                    {
                        name: chrome.i18n.getMessage("FullDetails"),
                        listener: () => window.open(CompileConfig.wikiLinks[category]),
                    },
                    {
                        name: chrome.i18n.getMessage("Hide"),
                        listener: () => {
                            Config.config.showCategoryGuidelines = false;
                            this.guidelinesReminder?.close();
                            this.guidelinesReminder = null;
                        },
                    },
                ],
                timed: false,
                style: {
                    right: `${dialogWidth + 10}px`,
                },
                extraClass: "sb-guidelines-notice",
            };

            if (options.textBoxes) {
                if (this.guidelinesReminder) {
                    this.guidelinesReminder.update(options);
                } else {
                    this.guidelinesReminder = new GenericNotice(null, "GuidelinesReminder", options);
                }
            } else {
                this.guidelinesReminder?.close();
                this.guidelinesReminder = null;
            }
        }
    }

    popoverContent = () => {
        return (
            <>
                <p>{chrome.i18n.getMessage("skipFrameShortcutPopupLine1")}</p>
                <p>
                    {chrome.i18n.getMessage("skipFrameShortcutPopupLine2").split("{0}")[0]}
                    <a
                        style={{ color: "var(--sb-brand-blue)" }}
                        onClick={() => {
                            chrome.runtime.sendMessage({ message: "openConfig", hash: "keybinds" });
                        }}
                    >
                        {chrome.i18n.getMessage("optionsPage")}
                    </a>
                    {chrome.i18n.getMessage("skipFrameShortcutPopupLine2").split("{0}")[1]}
                </p>
                <p style={{ padding: "0 20px", textAlign: "center" }}>
                    <a
                        style={{ paddingRight: "30px" }}
                        onClick={() => {
                            this.setState({ popoverOpen: false });
                        }}
                    >
                        {chrome.i18n.getMessage("close")}
                    </a>
                    <a
                        onClick={() => {
                            Config.config.showShortcutPopover = false;
                            this.setState({ popoverOpen: false });
                        }}
                    >
                        {chrome.i18n.getMessage("Hide")}
                    </a>
                </p>
            </>
        );
    };
}

export default SubmissionNoticeComponent;
