//
// Message and Response Types
//

import { BVID, NewVideoID, PortVideo, SegmentUUID, SponsorHideType, SponsorTime, YTID } from "./types";

interface BaseMessage {
    from?: string;
}

interface DefaultMessage {
    message:
    | "update"
    | "sponsorStart"
    | "getVideoID"
    | "getChannelID"
    | "getChannelInfo"
    | "isChannelWhitelisted"
    | "submitTimes"
    | "refreshSegments"
    | "closePopup";
}

interface BoolValueMessage {
    message: "whitelistChange";
    value: boolean;
}

interface IsInfoFoundMessage {
    message: "isInfoFound";
    updating: boolean;
}

interface SkipMessage {
    message: "unskip" | "reskip" | "selectSegment";
    UUID: SegmentUUID;
}

interface SubmitVoteMessage {
    message: "submitVote";
    type: number;
    UUID: SegmentUUID;
}

interface HideSegmentMessage {
    message: "hideSegment";
    type: SponsorHideType;
    UUID: SegmentUUID;
}

interface CopyToClipboardMessage {
    message: "copyToClipboard";
    text: string;
}

interface ImportSegmentsMessage {
    message: "importSegments";
    data: string;
}

interface KeyDownMessage {
    message: "keydown";
    key: string;
    keyCode: number;
    code: string;
    which: number;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
}

interface SubmitPortVideoMessage {
    message: "submitPortVideo";
    ytbID: YTID;
}

interface GetPortVideoMessage {
    message: "getPortVideo";
}

interface votePortVideoMessage {
    message: "votePortVideo";
    vote: number;
    UUID: string;
    bvid: BVID;
}

interface updatePortVideoMessage {
    message: "updatePortedSegments";
    UUID: string;
}

export type Message = BaseMessage &
    (
        | DefaultMessage
        | BoolValueMessage
        | IsInfoFoundMessage
        | SkipMessage
        | SubmitVoteMessage
        | HideSegmentMessage
        | CopyToClipboardMessage
        | ImportSegmentsMessage
        | KeyDownMessage
        | SubmitPortVideoMessage
        | GetPortVideoMessage
        | votePortVideoMessage
        | updatePortVideoMessage
    );

export interface IsInfoFoundMessageResponse {
    found: boolean;
    status: number;
    sponsorTimes: SponsorTime[];
    portVideo: PortVideo;
    time: number;
}

interface GetVideoIdResponse {
    videoID: string;
}

export interface GetChannelIDResponse {
    channelID: string;
}

export interface GetChannelInfoResponse {
    channelID: string;
    channelName: string;
}

export interface SponsorStartResponse {
    creatingSegment: boolean;
}

export interface IsChannelWhitelistedResponse {
    value: boolean;
}

export type MessageResponse =
    | IsInfoFoundMessageResponse
    | GetVideoIdResponse
    | GetChannelIDResponse
    | GetChannelInfoResponse
    | SponsorStartResponse
    | IsChannelWhitelistedResponse
    | Record<string, never> // empty object response {}
    | VoteResponse
    | ImportSegmentsResponse
    | RefreshSegmentsResponse
    | PortVideo;

export interface VoteResponse {
    successType: number;
    statusCode: number;
    responseText: string;
}

interface ImportSegmentsResponse {
    importedSegments: SponsorTime[];
}

export interface RefreshSegmentsResponse {
    hasVideo: boolean;
}

export interface TimeUpdateMessage {
    message: "time";
    time: number;
}

export type InfoUpdatedMessage = IsInfoFoundMessageResponse & {
    message: "infoUpdated";
};

export interface VideoChangedPopupMessage {
    message: "videoChanged";
    videoID: NewVideoID;
    whitelisted: boolean;
}

export type PopupMessage = TimeUpdateMessage | InfoUpdatedMessage | VideoChangedPopupMessage;
