export enum PageType {
    Unknown = "unknown",
    Main = "main",
    History = "history",
    OldHistory = "oldHistory",
    Video = "video",
    List = "list",
    Search = "search",
    Dynamic = "dynamic",
    Channel = "channel",
    Message = "message",
    Manga = "manga", // 漫画
    Anime = "bangumi", // 番剧
    Live = "live",
    Opus = "opus", //专栏
    Embed = "embed",
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

export enum DynamicSponsorOption {
    Disabled,
    ShowOverlay,
    Hide,
}

export interface DynamicSponsorSelection {
    name: Category;
    option: DynamicSponsorOption;
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
    cid: CID;
    UUID: SegmentUUID;
    locked?: number;

    category: Category;
    actionType: ActionType;

    hidden?: SponsorHideType;
    source: SponsorSourceType;
    videoDuration?: number;
}

export interface SponsorTimeHashedID {
    videoID: BVID;
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

export interface PortVideo {
    bvID: BVID;
    cid: CID;
    ytbID: BVID;
    UUID: string;
    votes: number;
    locked: boolean;
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

export type BVID = string & { __videoID: never };
export type CID = string & { __videoID: never };
export type AID = string & { __videoID: never };
export type YTID = string & { __videoID: never };

export type NewVideoID = string & { __videoID: never };

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

export interface WhitelistedChannel {
    id: string;
    name: string;
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

export enum NoticeVisibilityMode {
    FullSize = 0,
    MiniForAutoSkip = 1,
    MiniForAll = 2,
    FadedForAutoSkip = 3,
    FadedForAll = 4,
}

export enum HideFullVideoLabels {
    Disabled = 0,
    Overlay = 1,
    Hide = 2,
    BlurRevealOnHover = 3,
    BlurAlways = 4,
    SolidCover = 5,
}

export interface CacheStats {
    entryCount: number;
    sizeBytes: number;
    dailyStats?: DailyCacheStats;
}

export interface DailyCacheStats {
    date: string;
    hits: number;
    sizeBytes: number;
}
