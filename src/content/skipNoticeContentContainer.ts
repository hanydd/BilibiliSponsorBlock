import { ContentContainer } from "../ContentContainerTypes";
import { getChannelIDInfo } from "../utils/video";
import { getContentApp } from "./app";
import { contentState } from "./state";

export const getSkipNoticeContentContainer: ContentContainer = () => ({
    vote: (type, UUID, category, skipNotice) =>
        getContentApp().commands.execute("segment/vote", { type, UUID, category, skipNotice }),
    dontShowNoticeAgain: () => {
        void getContentApp().commands.execute("skip/dontShowNoticeAgain", undefined);
    },
    unskipSponsorTime: (segment, unskipTime, forceSeek) =>
        getContentApp().commands.execute("skip/unskip", { segment, unskipTime, forceSeek }),
    sponsorTimesSubmitting: contentState.sponsorTimesSubmitting,
    reskipSponsorTime: (segment, forceSeek) =>
        getContentApp().commands.execute("skip/reskip", { segment, forceSeek }),
    resetSponsorSubmissionNotice: (callRef?: boolean) => {
        void getContentApp().commands.execute("segment/resetSubmissionNotice", { callRef });
    },
    updateEditButtonsOnPlayer: () => {
        void getContentApp().commands.execute("ui/updatePlayerButtons", undefined);
    },
    addSubmittingSegment: (segment) => {
        void getContentApp().commands.execute("segments/addSubmitting", {
            segment,
            source: "skipNoticeContentContainer.addSubmittingSegment",
        });
    },
    replaceSubmittingSegments: (segments) => {
        void getContentApp().commands.execute("segments/replaceSubmitting", {
            segments,
            source: "skipNoticeContentContainer.replaceSubmittingSegments",
        });
    },
    removeSubmittingSegment: (index) => {
        void getContentApp().commands.execute("segments/removeSubmitting", {
            index,
            source: "skipNoticeContentContainer.removeSubmittingSegment",
        });
    },
    previewTime: (time: number, unpause?: boolean, segmentId?: string) =>
        getContentApp().commands.execute("skip/previewTime", { time, unpause, segmentId }),
    videoInfo: contentState.videoInfo,
    getRealCurrentTime: () => getContentApp().commands.execute("segment/getRealCurrentTime", undefined) as number,
    lockedCategories: contentState.lockedCategories,
    channelIDInfo: getChannelIDInfo(),
});
