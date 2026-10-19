import { SponsorSourceType, SponsorTime } from "../types";

export interface CidReplacementCandidate {
    videoID: string;
    oldCid: string;
    newCid: string;
}

export interface CidReplacementPage {
    videoID: string;
    pages: { cid: string; page: number; duration: number }[];
}

export function validCid(cid: unknown): cid is string {
    return typeof cid === "string" && /^[1-9]\d{0,15}$/.test(cid) && Number.isSafeInteger(Number(cid));
}

export function validCandidate(value: CidReplacementCandidate): boolean {
    return !!value && /^BV1[a-zA-Z0-9]{9}$/.test(value.videoID)
        && validCid(value.oldCid) && validCid(value.newCid) && value.oldCid !== value.newCid;
}

/** Duration identifies candidates only. The server must verify each segment before use. */
export function findCidReplacementCandidates(
    videoID: string,
    newCid: string,
    duration: number,
    page: CidReplacementPage | null,
    segments: SponsorTime[]
): CidReplacementCandidate[] {
    if (!page || page.videoID !== videoID || !Array.isArray(page.pages) || page.pages.length !== 1) return [];
    const current = page.pages[0];
    if (!current || current.page !== 1 || current.cid !== newCid
        || !Number.isFinite(current.duration) || current.duration < 60 || current.duration > 7200
        || !Number.isFinite(duration) || Math.abs(duration - current.duration) >= 1) return [];

    const groups = new Map<string, SponsorTime[]>();
    for (const segment of segments) {
        if (segment.source !== SponsorSourceType.Server || !validCid(segment.cid) || segment.cid === newCid) continue;
        groups.set(segment.cid, [...(groups.get(segment.cid) ?? []), segment]);
    }
    return [...groups].filter(([, group]) => group.every(segment =>
        Number.isFinite(segment.videoDuration) && Math.abs(segment.videoDuration - current.duration) < 1
    )).map(([oldCid]) => ({ videoID, oldCid, newCid })).filter(validCandidate)
        .sort((a, b) => Number(b.oldCid) - Number(a.oldCid));
}
