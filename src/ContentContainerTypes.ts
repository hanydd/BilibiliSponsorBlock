import SubmissionNotice from "./render/SubmissionNotice";
import SkipNoticeComponent from "./components/SkipNoticeComponent";
import SkipNotice from "./render/SkipNotice";
import advanceSkipNotice from "./render/advanceSkipNotice";
import { SegmentUUID, Category, SponsorTime, VideoInfo, ChannelIDInfo } from "./types";

export interface ContentContainer {
    (): {
        vote: (type: number, UUID: SegmentUUID, category?: Category, skipNotice?: SkipNoticeComponent) => void;
        dontShowNoticeAgain: () => void;
        unskipSponsorTime: (segment: SponsorTime, unskipTime: number, forceSeek?: boolean) => void;
        sponsorTimes: SponsorTime[];
        sponsorTimesSubmitting: SponsorTime[];
        skipNotices: SkipNotice[];
        advanceSkipNotices: advanceSkipNotice;
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
