import * as React from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot, Root } from "react-dom/client";
import Config from "../config";
import { getVideoID, getCid, getVideo } from "../utils/video";
import Utils from "../utils";
import SkipNoticeComponent, { SkipNoticeProps } from "../components/SkipNoticeComponent";
import { ContentContainer } from "../ContentContainerTypes";
import { ActionType, SponsorTime } from "../types";
import { SkipNoticeAction } from "../utils/noticeUtils";
import { dismissStackCard } from "./SkipNoticeStack";

export interface SkipNoticeUpdate {
    segments: SponsorTime[];
    autoSkip: boolean;
    upcoming: boolean;
    unskipTime?: number;
    startReskip?: boolean;
}

/** One React owner per player. Portals keep card identity while layout moves wrappers. */
class NoticeList {
    private root: Root;
    private cards = new Set<SkipNotice>();

    constructor(private player: HTMLElement) {
        // All visible content is portalled into card wrappers. The owner needs no
        // empty element in the player's DOM (or its hit-testing/layout tree).
        this.root = createRoot(document.createDocumentFragment());
    }

    add(card: SkipNotice): void {
        this.cards.add(card);
        this.player.prepend(card.noticeElement);
        this.render();
    }

    render(): void {
        this.root.render(<>{[...this.cards].map(card => createPortal(
            <SkipNoticeComponent {...card.props} ref={card.skipNoticeRef} />,
            card.noticeElement, card.id
        ))}</>);
    }

    remove(card: SkipNotice): void {
        this.cards.delete(card);
        // Layout must see the unregistered card before starting downward settlement.
        flushSync(() => this.render());
        card.noticeElement.remove();
        if (!this.cards.size) {
            lists.delete(this.player);
            this.root.unmount();
        }
    }
}

const lists = new WeakMap<HTMLElement, NoticeList>();
let nextNoticeId = 0;

/** Stable record shared by preview, pending and completed presentations. */
export default class SkipNotice {
    readonly id: string;
    private readonly videoID = getVideoID();
    private readonly cid = getCid();
    readonly noticeElement = document.createElement("div");
    readonly skipNoticeRef = React.createRef<SkipNoticeComponent>();
    props: SkipNoticeProps;
    closed = false;
    private list: NoticeList;

    constructor(update: SkipNoticeUpdate, contentContainer: ContentContainer, private onClosed: (notice: SkipNotice) => void, onInteractionChange: () => void) {
        this.id = `${this.videoID}-${this.cid}-${update.segments.map(segment => segment.UUID).join("-")}-${++nextNoticeId}`;
        this.noticeElement.className = "sponsorSkipNoticeContainer";
        this.noticeElement.id = `sponsorSkipNoticeContainer${this.id}`;
        this.props = {
            ...this.toProps(update), id: this.id, revision: 0, contentContainer,
            showKeybindHint: false,
            closeListener: () => this.close(), onInteractionChange,
        };
        // Scrolling or a player menu can obscure the visibility probe while the
        // current video still plays. Keep its notice attached to its own player.
        const player = getVideo()?.closest<HTMLElement>(".bpx-player-video-area") ?? new Utils().findReferenceNode();
        if (!player) {
            this.closed = true;
            return;
        }
        this.list = lists.get(player);
        if (!this.list) { this.list = new NoticeList(player); lists.set(player, this.list); }
        this.list.add(this);
    }

    get segments(): SponsorTime[] { return this.props.segments; }
    get actionable(): boolean {
        return !this.closed && this.skipNoticeRef.current?.state.showSkipButton?.[0] !== false &&
            (this.segments.length > 1 || this.segments[0].actionType !== ActionType.Poi || this.props.unskipTime != null);
    }

    get focused(): boolean { return this.noticeElement.contains(document.activeElement); }
    get hovered(): boolean { return !!this.noticeElement.querySelector(".sponsorSkipStackCard:hover"); }

    get upcoming(): boolean { return !!this.props.advanceSkipNotice; }

    private toProps(update: SkipNoticeUpdate) {
        return {
            segments: [...update.segments].sort((a, b) => a.segment[0] - b.segment[0]),
            autoSkip: update.autoSkip, advanceSkipNotice: update.upcoming,
            unskipTime: update.unskipTime, startReskip: update.startReskip,
        };
    }

    update(update: SkipNoticeUpdate): void {
        if (this.closed) return;
        this.props = { ...this.props, ...this.toProps(update), revision: this.props.revision + 1 };
        this.list.render();
    }

    isCurrentVideo(): boolean { return this.videoID === getVideoID() && this.cid === getCid(); }

    sameNotice(segments: SponsorTime[]): boolean {
        return segments.length === this.segments.length && this.contains(segments);
    }

    contains(segments: SponsorTime[]): boolean {
        return this.segments.every(old => segments.some(segment => segment.UUID === old.UUID));
    }

    setShowKeybindHint(value: boolean): void {
        value &&= Config.config.skipKeybind != null;
        if (value === this.props.showKeybindHint) return;
        this.props = { ...this.props, showKeybindHint: value };
        this.list.render();
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.onClosed(this);
        dismissStackCard(this.noticeElement, () => this.list.remove(this));
    }

    toggleSkip(): void {
        if (!this.closed) this.skipNoticeRef.current?.prepAction(SkipNoticeAction.Unskip0);
    }

    unmutedListener(time: number): void {
        if (!this.upcoming && !this.closed) this.skipNoticeRef.current?.unmutedListener(time);
    }
}
