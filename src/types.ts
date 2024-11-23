import SubmissionNotice from "./render/SubmissionNotice";
import SkipNoticeComponent from "./components/SkipNoticeComponent";
import SkipNotice from "./render/SkipNotice";

export enum PageType {
    Unknown = "unknown",
    Main = "main",
    History = "history",
    Video = "video",
    List = "list",
    Search = "search",
    Dynamic = "dynamic",
    Channel = "channel",
    Message = "message",
    Manga = "manga", // 漫画
    Anime = "bangumi", // 番剧
    Live = "live",
    Embed = "embed",
}
export interface ContentContainer {
    (): {
        vote: (type: number, UUID: SegmentUUID, category?: Category, skipNotice?: SkipNoticeComponent) => void;
        dontShowNoticeAgain: () => void;
        unskipSponsorTime: (segment: SponsorTime, unskipTime: number, forceSeek?: boolean) => void;
        sponsorTimes: SponsorTime[];
        sponsorTimesSubmitting: SponsorTime[];
        skipNotices: SkipNotice[];
        sponsorVideoID;
        reskipSponsorTime: (segment: SponsorTime, forceSeek?: boolean) => void;
        updatePreviewBar: () => void;
        sponsorSubmissionNotice: SubmissionNotice;
        resetSponsorSubmissionNotice: (callRef?: boolean) => void;
        updateEditButtonsOnPlayer: () => void;
        previewTime: (time: number, unpause?: boolean) => void;
        videoInfo: VideoInfo;
        getRealCurrentTime: () => number;
        lockedCategories: string[];
        channelIDInfo: ChannelIDInfo;
    };
}

export interface VideoDurationResponse {
    duration: number;
}

export enum CategorySkipOption {
    Disabled = -1,
    ShowOverlay,
    ManualSkip,
    AutoSkip,
}

export interface CategorySelection {
    name: Category;
    option: CategorySkipOption;
}

export enum SponsorHideType {
    Visible = undefined,
    Downvoted = 1,
    MinimumDuration,
    Hidden,
}

export enum ActionType {
    Skip = "skip",
    Mute = "mute",
    Full = "full",
    Poi = "poi",
}

export const ActionTypes = [ActionType.Skip, ActionType.Mute, ActionType.Full, ActionType.Poi];

export type SegmentUUID = string & { __segmentUUIDBrand: unknown };
export type Category = string & { __categoryBrand: unknown };

export enum SponsorSourceType {
    Server = undefined,
    Local = 1,
    YouTube = 2,
    Danmaku = 3,
}
export interface SponsorTime {
    segment: [number] | [number, number];
    UUID: SegmentUUID;
    locked?: number;

    category: Category;
    actionType: ActionType;

    hidden?: SponsorHideType;
    source: SponsorSourceType;
    videoDuration?: number;
}

export interface SponsorTimeHashedID {
    videoID: VideoID;
    segments: SponsorTime[];
}

export interface ScheduledTime extends SponsorTime {
    scheduledTime: number;
}

export interface PreviewBarOption {
    color: string;
    opacity: string;
}

export interface Registration {
    message: string;
    id: string;
    allFrames: boolean;
    js: string[];
    css: string[];
    matches: string[];
}

export interface BackgroundScriptContainer {
    registerFirefoxContentScript: (opts: Registration) => void;
    unregisterFirefoxContentScript: (id: string) => void;
}

export interface VideoInfo {
    responseContext: {
        serviceTrackingParams: Array<{ service: string; params: Array<{ key: string; value: string }> }>;
        webResponseContextExtensionData: {
            hasDecorated: boolean;
        };
    };
    playabilityStatus: {
        status: string;
        playableInEmbed: boolean;
        miniplayer: {
            miniplayerRenderer: {
                playbackMode: string;
            };
        };
    };
    streamingData: unknown;
    playbackTracking: unknown;
    videoDetails: {
        videoId: string;
        title: string;
        lengthSeconds: string;
        keywords: string[];
        channelId: string;
        isOwnerViewing: boolean;
        shortDescription: string;
        isCrawlable: boolean;
        thumbnail: {
            thumbnails: Array<{ url: string; width: number; height: number }>;
        };
        averageRating: number;
        allowRatings: boolean;
        viewCount: string;
        author: string;
        isPrivate: boolean;
        isUnpluggedCorpus: boolean;
        isLiveContent: boolean;
    };
    playerConfig: unknown;
    storyboards: unknown;
    microformat: {
        playerMicroformatRenderer: {
            thumbnail: {
                thumbnails: Array<{ url: string; width: number; height: number }>;
            };
            embed: {
                iframeUrl: string;
                flashUrl: string;
                width: number;
                height: number;
                flashSecureUrl: string;
            };
            title: {
                simpleText: string;
            };
            description: {
                simpleText: string;
            };
            lengthSeconds: string;
            ownerProfileUrl: string;
            externalChannelId: string;
            availableCountries: string[];
            isUnlisted: boolean;
            hasYpcMetadata: boolean;
            viewCount: string;
            category: Category;
            publishDate: string;
            ownerChannelName: string;
            uploadDate: string;
        };
    };
    trackingParams: string;
    attestation: unknown;
    messages: unknown;
}

export type AID = number & { __avID: never };
export type BvID = string & { __bvID: never };
export type CID = number & { __cID: never };

export type VideoID = { bvid: BvID; cid: CID; p: number; aid?: AID };
export type YoutubeID = string & { __youtubeID: never };

export type UnEncodedSegmentTimes = [string, SponsorTime[]][];

export enum ChannelIDStatus {
    Fetching,
    Found,
    Failed,
}

export interface ChannelIDInfo {
    id: string;
    status: ChannelIDStatus;
}

export interface SkipToTimeParams {
    v: HTMLVideoElement;
    skipTime: number[];
    skippingSegments: SponsorTime[];
    openNotice: boolean;
    forceAutoSkip?: boolean;
    unskipTime?: number;
    forceNoAutoSkip?: boolean;
}

export interface ToggleSkippable {
    toggleSkip: () => void;
    setShowKeybindHint: (show: boolean) => void;
}

export enum NoticeVisbilityMode {
    FullSize = 0,
    MiniForAutoSkip = 1,
    MiniForAll = 2,
    FadedForAutoSkip = 3,
    FadedForAll = 4,
}
