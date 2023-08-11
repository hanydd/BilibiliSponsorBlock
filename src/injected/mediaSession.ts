let lastArtworkSrc: string | null = null;

let mediaSessionThumbnailWaitingTimeout: NodeJS.Timeout | null = null;
let mediaSessionThumbnailData: MediaMetadataInit | null = null;
export function setMediaSessionInfo(data: MediaMetadataInit) {
    if ("mediaSession" in navigator) {
        mediaSessionThumbnailData ||= {};
        mediaSessionThumbnailData = {
            ...mediaSessionThumbnailData,
            ...data
        };

        if (navigator.mediaSession.metadata?.artwork?.[0]?.src
                && !navigator.mediaSession.metadata.artwork[0].src.includes("dearrow-thumb")){
            lastArtworkSrc = navigator.mediaSession.metadata.artwork[0].src;
        }

        if (checkIfDifference(navigator.mediaSession.metadata, mediaSessionThumbnailData)) {
            setMediaSessionWithDefaults(mediaSessionThumbnailData);

            if (mediaSessionThumbnailWaitingTimeout) {
                clearTimeout(mediaSessionThumbnailWaitingTimeout);
            }

            mediaSessionThumbnailWaitingTimeout = setTimeout(() => {
                if (mediaSessionThumbnailData && checkIfDifference(navigator.mediaSession.metadata, mediaSessionThumbnailData)) {
                    setMediaSessionWithDefaults(mediaSessionThumbnailData);
                }

                mediaSessionThumbnailWaitingTimeout = null;
            }, 500);

        }
    }
}

export function resetMediaSessionThumbnail() {
    if (lastArtworkSrc) {
        setMediaSessionInfo({
            title: (mediaSessionThumbnailData?.title ?? navigator.mediaSession.metadata?.title)?.trim(),
            artwork: [{
                src: lastArtworkSrc
            }]
        });
    }
}

function setMediaSessionWithDefaults(data: MediaMetadataInit) {
    if ("mediaSession" in navigator) {
        const newData = {
            ...copyMediaSession()
        };
        for (const key in data) {
            // Doing this instead of spread operator due to Firefox bug
            newData[key] = data[key];
        }

        if (newData.artwork?.[0]?.src && newData.artwork?.[0]?.src !== navigator.mediaSession.metadata?.artwork?.[0]?.src) {
            // Extra space to force it to reload the thumbnail
            if (newData.title?.endsWith(" ")) {
                newData.title = newData.title.trim();
            } else {
                newData.title = newData.title + " ";
            }
        }

        navigator.mediaSession.metadata = new MediaMetadata(newData);
    }
}

function checkIfDifference(original: unknown, newData: unknown) {
    if (original && newData) {
        // using keys array to support arrays
        for (const key of Object.keys(newData)) {
            if (typeof newData[key] === "object" && checkIfDifference(original[key], newData[key])) {
                return true;
            } else if (original[key] !== newData[key]) {
                return true;
            }
        }
    }
    

    return false;
}

function copyMediaSession(): MediaMetadataInit {
    const copiedData = {
        ...navigator.mediaSession.metadata!,
        artwork: [...(navigator.mediaSession.metadata?.artwork ?? [])]
    };

    // Firefox compatibility mode
    if (copiedData.title === undefined) {
        return {
            title: navigator.mediaSession.metadata?.title ?? "",
            artist: navigator.mediaSession.metadata?.artist ?? "",
            album: navigator.mediaSession.metadata?.album ?? "",
            artwork: [...(navigator.mediaSession.metadata?.artwork ?? [])]
        }
    }

    return copiedData;
}

export function resetLastArtworkSrc() {
    lastArtworkSrc = null;
}