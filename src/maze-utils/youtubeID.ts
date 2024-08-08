import { VideoID } from "./video";

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

export function parseYoutubeID(rawId: string): VideoID | null {
    // first decode URI
    rawId = decodeURIComponent(rawId);
    // strict matching
    const strictMatch = rawId.match(exclusiveIdegex)?.[1];
    const urlMatch = rawId.match(urlRegex)?.[1];

    const regexMatch = strictMatch
        ? (strictMatch as VideoID)
        : negativeRegex.test(rawId)
        ? null
        : urlMatch
        ? (urlMatch as VideoID)
        : null;

    return regexMatch ? regexMatch : parseYouTubeVideoIDFromURL(rawId);
}

export function parseYouTubeVideoIDFromURL(url: string): VideoID | null {
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
        return id?.length == 11 ? (id as VideoID) : null;
    } else if (urlObject.pathname.startsWith("/embed/") || urlObject.pathname.startsWith("/shorts/")) {
        try {
            const id = urlObject.pathname.split("/")[2];
            if (id?.length >= 11) {
                return id.slice(0, 11) as VideoID;
            }
        } catch (e) {
            console.error("[SB] Video ID not valid for " + url);
            return null;
        }
    }

    return null;
}
