import * as React from "react";
import SbSvg from "../svg-icons/sb_svg";
import { registerStackCard, setStackCardExpanded } from "../render/SkipNoticeStack";
import { NoticeClock, secondsUntilSegment } from "../notices/NoticeClock";
import { getVideo } from "../utils/video";

interface StackNoticeProps {
    idSuffix: string;
    noticeTitle: string;
    smaller: boolean;
    compact?: boolean;
    startFaded: boolean;
    logoFill: string;
    firstColumn: React.ReactElement;
    bottomRow: React.ReactElement[];
    maxCountdownTime: () => number;
    upcomingStart?: number;
    playbackEnd?: number;
    dismissalPaused?: boolean;
    closeListener: () => void;
    onInteractionChange: () => void;
}

interface StackNoticeState {
    seconds: number;
    mode: "running" | "paused" | "stopped";
}

/** Presentation and lifetime clock for B1 cards; generic draggable notices are separate. */
export default class StackNoticeComponent extends React.Component<StackNoticeProps, StackNoticeState> {
    private parentRef = React.createRef<HTMLDivElement>();
    private clock: NoticeClock;
    private interval: ReturnType<typeof setInterval>;
    private unregister: () => void;
    private stackPaused = false;
    private stopped = false;
    private closing = false;
    private video: HTMLVideoElement;
    private mediaEvents = ["timeupdate", "seeking", "seeked", "ratechange", "pause", "playing", "waiting"];

    constructor(props: StackNoticeProps) {
        super(props);
        this.clock = new NoticeClock(props.maxCountdownTime() * 1000);
        this.state = { seconds: Math.ceil(props.maxCountdownTime()), mode: "running" };
    }

    private get idSuffix(): string { return this.props.idSuffix; }

    componentDidMount(): void {
        this.video = getVideo();
        this.mediaEvents.forEach(event => this.video?.addEventListener(event, this.tick));
        this.unregister = registerStackCard({
            element: this.parentRef.current,
            expanded: !this.props.smaller,
            animateArrival: true,
            setPaused: paused => {
                this.stackPaused = paused;
                this.clock.setPaused(paused || this.stopped || !!this.props.dismissalPaused || this.props.playbackEnd !== undefined);
                this.tick();
            },
            close: () => this.close(),
        });
        this.interval = setInterval(this.tick, 100);
        this.tick();
    }

    componentDidUpdate(previous: StackNoticeProps): void {
        if (previous.dismissalPaused !== this.props.dismissalPaused || previous.playbackEnd !== this.props.playbackEnd) {
            this.clock.setPaused(this.stackPaused || this.stopped || !!this.props.dismissalPaused || this.props.playbackEnd !== undefined);
            this.tick();
        }
        if (previous.upcomingStart !== this.props.upcomingStart) this.resetCountdown();
        if (previous.smaller !== this.props.smaller) setStackCardExpanded(this.parentRef.current, !this.props.smaller);
    }

    componentWillUnmount(): void {
        this.closing = true;
        clearInterval(this.interval);
        this.mediaEvents.forEach(event => this.video?.removeEventListener(event, this.tick));
        this.unregister?.();
    }

    private tick = (): void => {
        if (this.closing) return;
        const upcoming = this.props.upcomingStart !== undefined;
        const deadline = this.props.upcomingStart ?? this.props.playbackEnd;
        const remaining = deadline !== undefined ? 0 : this.clock.read(this.props.maxCountdownTime() * 1000);
        if (deadline === undefined && remaining <= 0) { this.close(); return; }
        const seconds = deadline !== undefined
            ? secondsUntilSegment(this.video, deadline)
            : Math.ceil(remaining / 1000);
        // Hover may hold dismissal, but never changes a preview's media time.
        const mode = upcoming ? "running" : this.stopped ? "stopped" : (this.stackPaused || this.props.dismissalPaused || (this.props.playbackEnd !== undefined && this.video?.paused)) ? "paused" : "running";
        if (seconds !== this.state.seconds || mode !== this.state.mode) this.setState({ seconds, mode });
    };

    resetCountdown(): void {
        this.stopped = false;
        this.clock.reset(this.props.maxCountdownTime() * 1000);
        this.clock.setPaused(this.stackPaused || !!this.props.dismissalPaused || this.props.playbackEnd !== undefined);
        this.tick();
    }

    private toggleManualPause(): void {
        this.stopped = !this.stopped;
        this.clock.setPaused(this.stackPaused || this.stopped || !!this.props.dismissalPaused || this.props.playbackEnd !== undefined);
        this.tick();
    }

    getElement(): React.RefObject<HTMLDivElement> { return this.parentRef; }

    close(): void {
        if (this.closing) return;
        this.closing = true;
        clearInterval(this.interval);
        this.props.closeListener();
    }

    private handleStackMouseDown = (event: React.MouseEvent<HTMLDivElement>): void => {
        // Mouse-operated buttons must not steal the player's keyboard focus.
        // Tab focus and native form controls keep their normal browser behavior.
        if (event.button === 0 && (event.target as Element).closest("button")) event.preventDefault();
    };

    render(): React.ReactElement {
        return (
            <div ref={this.parentRef} id={"sponsorSkipNotice" + this.idSuffix}
                onMouseDownCapture={this.handleStackMouseDown}
                onPointerEnter={this.props.onInteractionChange}
                onPointerLeave={this.props.onInteractionChange}
                onFocusCapture={this.props.onInteractionChange}
                onBlurCapture={() => queueMicrotask(this.props.onInteractionChange)}
                className={"sponsorSkipObject sponsorSkipNoticeParent sponsorSkipStackCard" +
                    (this.props.compact ? " sponsorSkipNoticeCompact" : "") +
                    (this.props.upcomingStart !== undefined ? " sponsorSkipUpcomingNotice" : "")}>
                <div className={"sponsorSkipNoticeTableContainer" +
                    (this.props.startFaded ? " sponsorSkipNoticeFaded" : "")}>
                    <div className="sponsorSkipStackHeader sponsorSkipNoticeFirstRow sponsorSkipNotice">
                        <SbSvg fill={this.props.logoFill}
                            className="sponsorSkipLogo sponsorSkipObject" />
                        <span id={"sponsorSkipMessage" + this.idSuffix}
                            className="sponsorSkipMessage sponsorSkipObject" title={this.props.noticeTitle}>
                            {this.props.noticeTitle}
                        </span>
                        {this.props.firstColumn}
                        <button type="button" className="sponsorSkipStackCount sponsorSkipNoticeButton" hidden aria-label={chrome.i18n.getMessage("expandSkipNotices")} />
                        <button type="button"
                            id={"sponsorSkipNoticeTimeLeft" + this.idSuffix}
                            className="sponsorSkipNoticeTimeLeft"
                            disabled={this.props.upcomingStart !== undefined}
                            onClick={() => this.toggleManualPause()}>{this.getCountdownElements()}</button>
                        <button type="button" className="sponsorSkipNoticeButton sponsorSkipNoticeCloseButton sponsorSkipNoticeRightButton"
                            aria-label={chrome.i18n.getMessage("close") || "关闭"} onClick={() => this.close()}>
                            <img src={chrome.runtime.getURL("icons/close.png")} alt="" />
                        </button>
                    </div>
                    <div className="sponsorSkipStackDetail">
                        <table className="sponsorSkipObject sponsorSkipNotice sponsorSkipStackDetailInner">
                            <tbody>{this.props.bottomRow}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    getCountdownElements(): React.ReactElement[] {
        return [
            <span
                id={"skipNoticeTimerText" + this.idSuffix}
                key="skipNoticeTimerText"
                className={this.state.mode !== "running" ? "sbhidden" : ""}
            >
                {chrome.i18n
                    .getMessage("NoticeTimeAfterSkip")
                    .replace("{seconds}", this.state.seconds.toString())}
            </span>,
            <img
                id={"skipNoticeTimerPaused" + this.idSuffix}
                key="skipNoticeTimerPaused"
                className={this.state.mode !== "paused" ? "sbhidden" : ""}
                src={chrome.runtime.getURL("icons/pause.svg")}
                alt={chrome.i18n.getMessage("paused")}
            />,
            <img
                id={"skipNoticeTimerStopped" + this.idSuffix}
                key="skipNoticeTimerStopped"
                className={this.state.mode !== "stopped" ? "sbhidden" : ""}
                src={chrome.runtime.getURL("icons/stop.svg")}
                alt={chrome.i18n.getMessage("manualPaused")}
            />,
        ];
    }

}
