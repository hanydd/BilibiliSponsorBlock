import { getBvIDfromAvIDBiliApi } from "../requests/bilibiliApi";
import { AID, BvID, CID, VideoID, YoutubeID } from "../types";
import { BILI_DOMAINS } from "./constants";
import { getPropertyFromWindow } from "./injectedScriptMessageUtils";

export async function getBilibiliVideoID(url?: string): Promise<VideoID | null> {
    url ||= document?.URL;

    if (url.includes("bilibili.com/video") || url.includes("bilibili.com/list/")) {
        // video or list page
        const id = (await getBvIDFromWindow()) ?? getBvIDFromURL(url);
        return id;
    }
    return null;
}

/**
 * communicate with the injected script via messages
 * get video info from `window.__INITIAL_STATE__` object
 */
export function getBvIDFromWindow(timeout = 200): Promise<VideoID | null> {
    return getPropertyFromWindow<VideoID>(
        {
            sendType: "getVideoID",
            responseType: "returnVideoID",
        },
        timeout
    );
}

const BILIBILI_VIDEO_URL_REGEX = /^\/video\/((BV1[a-zA-Z0-9]{9})|(av\d+))\/?/;
/**
 * Parse without side effects
 */
export function getBvIDFromURL(url: string): VideoID | null {
    //Attempt to parse url
    let urlObject: URL | null = null;
    try {
        urlObject = new URL(url);
    } catch (e) {
        console.error("[BSB] Unable to parse URL: " + url);
        return null;
    }

    // Check if valid hostname
    if (!BILI_DOMAINS.includes(urlObject.host)) {
        return null;
    }

    // TODO: parse cid and p
    // Get ID from url
    // video page
    if (urlObject.host == "www.bilibili.com" && urlObject.pathname.startsWith("/video/")) {
        const idMatch = urlObject.pathname.match(BILIBILI_VIDEO_URL_REGEX);
        if (idMatch && idMatch[2]) {
            // BV id
            return { bvid: idMatch[2], p: 1 } as VideoID;
        } else if (idMatch && idMatch[3]) {
            // av id
            return getBvIDFromCache(idMatch[3], {
                bvid: "-1" as BvID,
                aid: parseInt(idMatch[3]) as AID,
                cid: 0 as CID,
                p: 1,
            } as VideoID);
        }
    } else if (urlObject.host == "www.bilibili.com" && urlObject.pathname.startsWith("/list/")) {
        const id = urlObject.searchParams.get("bvid");
        return { bvid: id, p: 1 } as VideoID;
    }

    return null;
}

const AvToBvMapCache = new Map<string, VideoID>();
const AvToBvLoading = new Set<string>();
function getBvIDFromCache(avID: string, placeholder: null | VideoID = null): VideoID | null {
    const bvID = AvToBvMapCache.get(avID);
    if (bvID) return bvID;

    if (!AvToBvLoading.has(avID)) {
        AvToBvLoading.add(avID);
        getBvIDfromAvIDBiliApi(parseInt(avID.replace("av", "")) as AID).then((bvID) => {
            AvToBvMapCache.set(avID, bvID as VideoID);
            AvToBvLoading.delete(avID);
        });
    }

    return placeholder;
}

/**
 * Validates and sanitizes a YouTube video ID.
 */
const idRegex = new RegExp(/([0-9A-Za-z_-]{11})/); // group to always be index 1
const exclusiveIdegex = new RegExp(`^${idRegex.source}$`);
// match /c/, /channel/, /@channel, full UUIDs
const negativeRegex = new RegExp(/(\/(channel|c)\/.+)|(\/@.+)|([a-f0-9]{64,65})|(youtube\.com\/clip\/)/);
const urlRegex = new RegExp(`(?:v=|/|youtu.be/)${idRegex.source}(?:|/|[?&]t=\\d+s?)>?(?:\\s|$)`);

export function validateYoutubeID(id: string): boolean {
    return exclusiveIdegex.test(id);
}

export function parseYoutubeID(rawId: string): YoutubeID | null {
    // first decode URI
    rawId = decodeURIComponent(rawId);
    // strict matching
    const strictMatch = rawId.match(exclusiveIdegex)?.[1];
    const urlMatch = rawId.match(urlRegex)?.[1];

    const regexMatch = strictMatch
        ? (strictMatch as YoutubeID)
        : negativeRegex.test(rawId)
        ? null
        : urlMatch
        ? (urlMatch as YoutubeID)
        : null;

    return regexMatch ? regexMatch : parseYouTubeVideoIDFromURL(rawId);
}

export function parseYouTubeVideoIDFromURL(url: string): YoutubeID | null {
    if (url.startsWith("https://www.youtube.com/tv#/")) url = url.replace("#", "");
    if (url.startsWith("https://www.youtube.com/tv?")) url = url.replace(/\?[^#]+#/, "");

    // Attempt to parse url
    let urlObject: URL | null = null;
    try {
        urlObject = new URL(url);
    } catch (e) {
        return null;
    }

    // Get ID from searchParam
    if (
        (urlObject.searchParams.has("v") && ["/watch", "/watch/"].includes(urlObject.pathname)) ||
        urlObject.pathname.startsWith("/tv/watch")
    ) {
        const id = urlObject.searchParams.get("v");
        return id?.length == 11 ? (id as YoutubeID) : null;
    } else if (urlObject.pathname.startsWith("/embed/") || urlObject.pathname.startsWith("/shorts/")) {
        try {
            const id = urlObject.pathname.split("/")[2];
            if (id?.length >= 11) {
                return id.slice(0, 11) as YoutubeID;
            }
        } catch (e) {
            console.error("[SB] Video ID not valid for " + url);
            return null;
        }
    }

    return null;
}
