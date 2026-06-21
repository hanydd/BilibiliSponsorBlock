import SkipNoticeComponent from "../../components/SkipNoticeComponent";
import PreviewBar from "../../js-components/previewBar";
import { SkipButtonControlBar } from "../../js-components/skipButtonControlBar";
import SubmissionNotice from "../../render/SubmissionNotice";
import advanceSkipNotice from "../../render/advanceSkipNotice";
import { CategoryPill } from "../../render/CategoryPill";
import { DescriptionPortPill } from "../../render/DescriptionPortPill";
import { PlayerButton } from "../../render/PlayerButton";
import SkipNotice from "../../render/SkipNotice";
import { StorageChangesObject } from "../../config/config";
import { VoteResponse } from "../../messageTypes";
import { FetchResponse } from "../../requests/type/requestType";
import {
    BVID,
    Category,
    ChannelIDInfo,
    NewVideoID,
    PageType,
    PortVideo,
    SegmentUUID,
    SkipToTimeParams,
    SponsorTime,
    ToggleSkippable,
    VideoInfo,
    YTID,
} from "../../types";
import { CONTENT_EVENTS } from "./events";

export interface ContentAppState {
    sponsorDataFound: boolean;
    sponsorTimes: SponsorTime[];
    skipNotices: SkipNotice[];
    advanceSkipNotices: advanceSkipNotice | null;
    activeSkipKeybindElement: ToggleSkippable;
    shownSegmentFailedToFetchWarning: boolean;
    previewedSegment: boolean;
    portVideo: PortVideo | null;
    videoInfo: VideoInfo | null;
    lockedCategories: Category[];
    switchingVideos: boolean | null;
    channelWhitelisted: boolean;
    sponsorTimesSubmitting: SponsorTime[];
    lastResponseStatus: number;
    pageLoaded: boolean;
    pageType: PageType;
    pageUrl: string;
}

export interface ContentUIRegistryState {
    playerButton: PlayerButton | null;
    playerButtons: Record<string, { button: HTMLButtonElement; image: HTMLImageElement }>;
    descriptionPill: DescriptionPortPill | null;
    submissionNotice: SubmissionNotice | null;
    popupInitialised: boolean;
    skipButtonControlBar: SkipButtonControlBar | null;
    categoryPill: CategoryPill | null;
    previewBar: PreviewBar | null;
    selectedSegment: SegmentUUID | null;
    lastPreviewBarUpdate: BVID | null;
}

export interface LastKnownVideoTimeState {
    videoTime: number | null;
    preciseTime: number | null;
    fromPause: boolean;
    approximateDelay: number | null;
}

export interface ContentEventMeta {
    source: string;
    timestamp: number;
}

export interface ContentEventMap {
    [CONTENT_EVENTS.APP_PAGE_READY]: { pageLoaded: boolean };
    [CONTENT_EVENTS.PAGE_CONTEXT_CHANGED]: {
        pageType: PageType;
        previousPageType: PageType;
        url: string;
        previousUrl: string;
    };
    [CONTENT_EVENTS.VIDEO_RESET_REQUESTED]: { reason: string };
    [CONTENT_EVENTS.VIDEO_ID_CHANGED]: { videoID: NewVideoID | null };
    [CONTENT_EVENTS.VIDEO_ELEMENT_CHANGED]: { newVideo: boolean; video: HTMLVideoElement | null };
    [CONTENT_EVENTS.VIDEO_CHANNEL_RESOLVED]: { channelIDInfo: ChannelIDInfo };
    [CONTENT_EVENTS.CHANNEL_WHITELIST_CHANGED]: {
        videoID: NewVideoID | null;
        whitelisted: boolean;
        reason: "popupToggle" | "channelResolved";
    };
    [CONTENT_EVENTS.CONFIG_CHANGED]: { changes: StorageChangesObject };
    [CONTENT_EVENTS.SEGMENTS_LOADED]: { sponsorTimes: SponsorTime[]; status: number; videoID: NewVideoID | null };
    [CONTENT_EVENTS.SEGMENTS_SUBMITTING_CHANGED]: {
        sponsorTimesSubmitting: SponsorTime[];
        getFromConfig: boolean;
        videoID: NewVideoID | null;
    };
    [CONTENT_EVENTS.SEGMENT_UPDATED]: {
        videoID: NewVideoID | null;
        UUID: SegmentUUID;
        segment: SponsorTime;
        reason: "popupHide" | "voteDown" | "voteUp" | "categoryVote";
    };
    [CONTENT_EVENTS.SKIP_EXECUTED]: {
        skipTime: [number, number];
        skippingSegments: SponsorTime[];
        autoSkip: boolean;
        openNotice: boolean;
        unskipTime?: number | null;
    };
    [CONTENT_EVENTS.SKIP_NOTICE_REQUESTED]: {
        noticeKind: "skip" | "advance";
        skippingSegments: SponsorTime[];
        autoSkip: boolean;
        unskipTime?: number | null;
        startReskip: boolean;
    };
    [CONTENT_EVENTS.SKIP_BUTTON_STATE_CHANGED]: { enabled: boolean; segment: SponsorTime | null; duration?: number };
    [CONTENT_EVENTS.PLAYER_TIME_UPDATED]: { time: number };
    [CONTENT_EVENTS.PLAYER_VIDEO_READY]: { video: HTMLVideoElement };
    [CONTENT_EVENTS.PLAYER_DURATION_CHANGED]: { video: HTMLVideoElement };
    [CONTENT_EVENTS.PLAYER_PLAY]: { video: HTMLVideoElement };
    [CONTENT_EVENTS.PLAYER_PLAYING]: { video: HTMLVideoElement };
    [CONTENT_EVENTS.PLAYER_SEEKING]: { video: HTMLVideoElement };
    [CONTENT_EVENTS.PLAYER_PAUSE]: { video: HTMLVideoElement };
    [CONTENT_EVENTS.PLAYER_WAITING]: { video: HTMLVideoElement };
    [CONTENT_EVENTS.PLAYER_RATE_CHANGED]: { video: HTMLVideoElement; playbackRate: number };
    [CONTENT_EVENTS.UI_POPUP_CLOSED]: Record<string, never>;
}

export interface ContentCommandDefinition<Payload = void, Result = void> {
    payload: Payload;
    result: Result;
}

export interface ContentCommandMap {
    "segment/toggleCapture": ContentCommandDefinition<void, void>;
    "segment/cancelCapture": ContentCommandDefinition<void, void>;
    "segment/submit": ContentCommandDefinition<void, void>;
    "segment/openSubmissionMenu": ContentCommandDefinition<void, void>;
    "segment/previewRecent": ContentCommandDefinition<void, void>;
    "segment/isCreationInProgress": ContentCommandDefinition<void, boolean>;
    "segment/getRealCurrentTime": ContentCommandDefinition<void, number>;
    "segment/resetSubmissionNotice": ContentCommandDefinition<{ callRef?: boolean }, void>;
    "segment/vote": ContentCommandDefinition<{
        type: number;
        UUID: SegmentUUID;
        category?: Category;
        skipNotice?: SkipNoticeComponent;
    }, VoteResponse>;
    "segment/voteAsync": ContentCommandDefinition<{ type: number; UUID: SegmentUUID; category?: Category }, VoteResponse | undefined>;
    "segments/lookup": ContentCommandDefinition<{
        keepOldSubmissions?: boolean;
        ignoreServerCache?: boolean;
        forceUpdatePreviewBar?: boolean;
    }, void>;
    "segments/updateSubmitting": ContentCommandDefinition<{ getFromConfig?: boolean }, void>;
    "segments/addSubmitting": ContentCommandDefinition<{ segment: SponsorTime; source?: string }, void>;
    "segments/replaceSubmitting": ContentCommandDefinition<{
        segments: SponsorTime[];
        source?: string;
        getFromConfig?: boolean;
    }, void>;
    "segments/removeSubmitting": ContentCommandDefinition<{ index: number; source?: string }, void>;
    "segments/clearSubmitting": ContentCommandDefinition<{ source?: string; resetNotice?: boolean }, void>;
    "segments/import": ContentCommandDefinition<{ importedSegments: SponsorTime[] }, void>;
    "segments/select": ContentCommandDefinition<{ UUID: SegmentUUID | null }, void>;
    "skip/startSchedule": ContentCommandDefinition<{
        includeIntersectingSegments?: boolean;
        currentTime?: number;
        includeNonIntersectingSegments?: boolean;
    }, void>;
    "skip/closeNotices": ContentCommandDefinition<{ includeAdvance?: boolean }, void>;
    "skip/dontShowNoticeAgain": ContentCommandDefinition<void, void>;
    "skip/checkStartSponsors": ContentCommandDefinition<void, void>;
    "skip/unskip": ContentCommandDefinition<{ segment: SponsorTime; unskipTime?: number; forceSeek?: boolean }, void>;
    "skip/reskip": ContentCommandDefinition<{ segment: SponsorTime; forceSeek?: boolean }, void>;
    "skip/execute": ContentCommandDefinition<SkipToTimeParams, void>;
    "skip/previewTime": ContentCommandDefinition<{ time: number; unpause?: boolean }, void>;
    "skip/updateVirtualTime": ContentCommandDefinition<void, void>;
    "skip/updateWaitingTime": ContentCommandDefinition<void, void>;
    "skip/clearWaitingTime": ContentCommandDefinition<void, void>;
    "skip/cancelSchedule": ContentCommandDefinition<void, void>;
    "skip/getVirtualTime": ContentCommandDefinition<void, number>;
    "skip/getLastKnownVideoTime": ContentCommandDefinition<void, LastKnownVideoTimeState>;
    "skip/getSponsorSkipped": ContentCommandDefinition<void, boolean[]>;
    "skip/isSegmentMarkedNearCurrentTime": ContentCommandDefinition<{ currentTime: number; range?: number }, boolean>;
    "ui/createPreviewBar": ContentCommandDefinition<void, void>;
    "ui/updatePreviewBar": ContentCommandDefinition<void, void>;
    "ui/checkPreviewBarState": ContentCommandDefinition<void, void>;
    "ui/updateActiveSegment": ContentCommandDefinition<{ currentTime: number }, void>;
    "ui/updatePlayerButtons": ContentCommandDefinition<void, void>;
    "ui/setupDescriptionPill": ContentCommandDefinition<void, void>;
    "ui/setupCategoryPill": ContentCommandDefinition<void, void>;
    "ui/setupSkipButtonControlBar": ContentCommandDefinition<void, void>;
    "popup/openInfoMenu": ContentCommandDefinition<void, void>;
    "popup/closeInfoMenu": ContentCommandDefinition<void, void>;
    "port/submitVideo": ContentCommandDefinition<{ ytbID: YTID }, PortVideo>;
    "port/voteVideo": ContentCommandDefinition<{ UUID: string; vote: number }, void>;
    "port/updateSegments": ContentCommandDefinition<{ UUID: string }, FetchResponse>;
    "config/applyCategoryColors": ContentCommandDefinition<void, void>;
}
