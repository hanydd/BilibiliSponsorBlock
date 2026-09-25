import SkipNoticeComponent from "./components/SkipNoticeComponent";
import { SegmentUUID, Category, SponsorTime, VideoInfo, ChannelIDInfo } from "./types";

export interface ContentContainer {
    (): {
        vote: (type: number, UUID: SegmentUUID, category?: Category, skipNotice?: SkipNoticeComponent) => void;
        dontShowNoticeAgain: () => void;
        unskipSponsorTime: (segment: SponsorTime, unskipTime: number, forceSeek?: boolean) => void;
        sponsorTimesSubmitting: SponsorTime[];
        reskipSponsorTime: (segment: SponsorTime, forceSeek?: boolean) => void;
        resetSponsorSubmissionNotice: (callRef?: boolean) => void;
        updateEditButtonsOnPlayer: () => void;
        addSubmittingSegment: (segment: SponsorTime) => void;
        replaceSubmittingSegments: (segments: SponsorTime[]) => void;
        removeSubmittingSegment: (index: number) => void;
        previewTime: (time: number, unpause?: boolean, segmentId?: string) => void;
        videoInfo: VideoInfo;
        getRealCurrentTime: () => number;
        lockedCategories: string[];
        channelIDInfo: ChannelIDInfo;
    };
}
