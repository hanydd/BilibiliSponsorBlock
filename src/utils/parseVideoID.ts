import { BVID, NewVideoID, YTID } from "../types";
import { BILI_DOMAINS } from "./constants";
import {
    getBvidFromAidFromWindow,
    getCidFromBvidAndPageFromWindow,
    getPropertyFromWindow,
} from "./injectedScriptMessageUtils";

export async function getBilibiliVideoID(url?: string): Promise<NewVideoID | null> {
    url ||= document?.URL;

    if (/www\.bilibili\.com.*BV[a-zA-Z0-9]{10}/.test(url)) {
        const id = (await getVideoIDFromWindow()) ?? (await getVideoIDFromURL(url));
        return id;
    }
    return null;
}

/**
 * communicate with the injected script via messages
 * get video info from `window.__INITIAL_SXTATE__` object
 */
export function getVideoIDFromWindow(timeout = 200): Promise<NewVideoID | null> {
    return getPropertyFromWindow<NewVideoID>(
        {
            sendType: "getBvID",
            responseType: "returnBvID",
        },
        timeout
    );
}

const BILIBILI_VIDEO_URL_REGEX = /^\/video\/((BV1[a-zA-Z0-9]{9})|(av\d+))\/?/;
const BVID_REGEX = /^(BV1[a-zA-Z0-9]{9})$/;
/**
 * Parse without side effects
 */
// TODO get cid from cache
export async function getBvIDFromURL(url: string): Promise<BVID | null> {
    url = url.trim();
    // check if is bvid already
    if (BVID_REGEX.test(url)) {
        return url as BVID;
    }

    //Attempt to parse url
    let urlObject: URL | null = null;
    try {
        urlObject = new URL(url, window.location.origin);
    } catch (e) {
        console.error("[BSB] Unable to parse URL: " + url);
        return null;
    }

    // Check if valid hostname
    if (!BILI_DOMAINS.includes(urlObject.host)) {
        return null;
    }

    // Get ID from url
    // video page
    if (urlObject.host == "www.bilibili.com" && urlObject.pathname.startsWith("/video/")) {
        const idMatch = urlObject.pathname.match(BILIBILI_VIDEO_URL_REGEX);
        if (idMatch && idMatch[2]) {
            // BV id
            return idMatch[2] as BVID;
        } else if (idMatch && idMatch[3]) {
            // av id
            return await getBvidFromAidFromWindow(idMatch[3]);
        }
        return null;
    } else {
        const id = urlObject.searchParams.get("bvid");
        return id as BVID ?? null;
    }
}

export async function getVideoIDFromURL(url: string): Promise<NewVideoID | null> {
    url = url.trim();

    //Attempt to parse url
    let urlObject: URL | null = null;
    try {
        urlObject = new URL(url, window.location.origin);
    } catch (e) {
        console.error("[BSB] Unable to parse URL: " + url);
        return null;
    }

    // Check if valid hostname
    if (!BILI_DOMAINS.includes(urlObject.host)) {
        return null;
    }

    // Get ID from url
    if (urlObject.host == "www.bilibili.com") {
        // Extract common parameters
        const page = Number(urlObject.searchParams.get("p") ?? 1);
        let bvid: BVID | null = null;

        // Video page
        if (urlObject.pathname.startsWith("/video/")) {
            const idMatch = urlObject.pathname.match(BILIBILI_VIDEO_URL_REGEX);
            if (idMatch && idMatch[2]) {
                // BV id
                bvid = idMatch[2] as BVID;
            } else if (idMatch && idMatch[3]) {
                // av id
                bvid = await getBvidFromAidFromWindow(idMatch[3]);
                if (!bvid) {
                    console.error("[BSB] Unable to convert av id to bv id: " + idMatch[3]);
                    return null;
                }
            }
        }
        // List & event video page
        else {
            bvid = urlObject.searchParams.get("bvid") as BVID;
        }

        // Return combined ID if bvid was found
        if (bvid) {
            const cid = (await getCidFromBvidAndPageFromWindow(bvid, page)) ?? "";
            return (bvid + "+" + cid) as NewVideoID;
        }
    }

    return null;
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

export function parseYoutubeID(rawId: string): YTID | null {
    // first decode URI
    rawId = decodeURIComponent(rawId);
    // strict matching
    const strictMatch = rawId.match(exclusiveIdegex)?.[1];
    const urlMatch = rawId.match(urlRegex)?.[1];

    const regexMatch = strictMatch
        ? (strictMatch as YTID)
        : negativeRegex.test(rawId)
        ? null
        : urlMatch
        ? (urlMatch as YTID)
        : null;

    return regexMatch ? regexMatch : parseYouTubeVideoIDFromURL(rawId);
}

export function parseYouTubeVideoIDFromURL(url: string): YTID | null {
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
        return id?.length == 11 ? (id as YTID) : null;
    } else if (urlObject.pathname.startsWith("/embed/") || urlObject.pathname.startsWith("/shorts/")) {
        try {
            const id = urlObject.pathname.split("/")[2];
            if (id?.length >= 11) {
                return id.slice(0, 11) as YTID;
            }
        } catch (e) {
            console.error("[SB] Video ID not valid for " + url);
            return null;
        }
    }

    return null;
}
