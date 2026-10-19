import { CalculateAvidToBvid } from "../utils/bvidAvidUtils";
import { CidReplacementPage } from "../utils/cidReplacement";

/** Read current page data, never the accumulated CID map used by export/navigation. */
export function readCidReplacementPage(videoID: string): CidReplacementPage | null {
    const state = window.__INITIAL_STATE__;
    const info = state?.bvid === videoID ? state.videoData : state?.toBvid === videoID ? state.videoInfo : null;
    if (!info || !Array.isArray(info.pages) || info.pages.length !== 1) return null;
    const current = info.pages[0];
    try {
        const manifest = window.player?.getManifest?.();
        // A stale initial state must not report a CID for another SPA playback context.
        const aid = Number(manifest?.aid);
        const manifestBvid = manifest?.bvid || (Number.isSafeInteger(aid) && aid > 0 ? CalculateAvidToBvid(aid) : null);
        if (!manifest || manifestBvid !== videoID || String(manifest.cid) !== String(current?.cid)
            || Number(manifest.p) !== 1) return null;
    } catch {
        return null;
    }
    return { videoID, pages: info.pages.map(page => ({ cid: String(page.cid), page: page.page, duration: page.duration })) };
}
