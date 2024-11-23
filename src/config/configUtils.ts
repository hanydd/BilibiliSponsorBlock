import Config from "../config";
import { VideoID } from "../types";

export function showDonationLink(): boolean {
    return navigator.vendor !== "Apple Computer, Inc." && Config.config.showDonationLink;
}

export function getUnsubmittedSegmentKey(videoID: VideoID): string {
    return videoID.bvid + videoID.cid;
}
