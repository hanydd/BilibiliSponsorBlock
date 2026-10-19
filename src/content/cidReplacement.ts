import Config from "../config";
import { NewVideoID, SponsorTime } from "../types";
import { findCidReplacementCandidates } from "../utils/cidReplacement";
import { getCidReplacementPageFromWindow } from "../utils/injectedScriptMessageUtils";
import { getVideo, getVideoID } from "../utils/video";
import { parseBvidAndCidFromVideoId } from "../utils/videoIdUtils";

/** Runs after segment publication; verification must not delay playback. */
export async function checkCidReplacement(
    videoID: NewVideoID,
    segments: SponsorTime[],
    refresh: () => Promise<void>
): Promise<void> {
    if (!Config.config.isVip || !Config.config.userID) return;
    const video = getVideo();
    let source = video?.currentSrc;
    const url = location.href;
    const current = () => getVideoID() === videoID && getVideo() === video
        && video?.currentSrc === source && location.href === url;
    const { bvId, cid } = parseBvidAndCidFromVideoId(videoID);
    if (!video || !current()) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
        await new Promise<void>(resolve => {
            const done = () => {
                clearTimeout(timeout);
                video.removeEventListener("loadedmetadata", done);
                video.removeEventListener("durationchange", done);
                resolve();
            };
            const timeout = setTimeout(done, 10000);
            video.addEventListener("loadedmetadata", done, { once: true });
            video.addEventListener("durationchange", done, { once: true });
        });
        source = video.currentSrc;
    }
    if (!current()) return;
    const page = await getCidReplacementPageFromWindow(bvId);
    if (!current()) return;
    const candidates = findCidReplacementCandidates(bvId, cid, video.duration, page, segments);
    if (!candidates.length) return;
    const migrated = await new Promise<boolean>((resolve) => {
        chrome.runtime.sendMessage({ message: "reportCidReplacement", candidates }, (result) => {
            // Read lastError so closing/reloading the extension does not produce an unchecked error.
            resolve(!chrome.runtime.lastError && result?.migrated === true);
        });
    });
    if (migrated && current()) await refresh();
}
