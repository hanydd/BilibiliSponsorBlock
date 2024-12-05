export interface PlayInfo {
    id: number;
    frameRate: number;
}

export function getPlayInfo(): PlayInfo[] {
    if (window.__playinfo__?.data?.dash?.video) {
        return window.__playinfo__.data.dash.video.map((v) => ({ id: v.id, frameRate: parseFloat(v.frameRate) }));
    }
    return [];
}

export function getFrameRate() {
    let currentQuality = null;
    try {
        currentQuality ||= JSON.parse(window?.localStorage?.bpx_player_profile)?.media?.quality;
    } catch (e) {
        console.debug("Failed to get current quality", e);
    }
    currentQuality = currentQuality ?? window?.__playinfo__?.data?.quality;

    const possibleQuality = getPlayInfo().filter((v) => v.id === currentQuality && !!v.frameRate);

    if (possibleQuality.length > 0) {
        return possibleQuality[0].frameRate;
    }
    return 30;
}
