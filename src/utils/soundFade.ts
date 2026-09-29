/**
 * 将任意数值钳制到 [0, 1]，非有限值回退到 fallback
 */
export function clamp01(value: number, fallback: number): number {
    return isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

/**
 * 让 audio 在播放进度超过 fadeStartFraction 后线性淡出到静音。
 * fadeStartFraction 为 1（或异常值）时不淡出，不启动定时器。
 * 播放自然结束或出错时定时器会自行清理；调用方停止/替换 audio 时应主动调用返回的清理函数。
 */
export function applyFadeOut(
    audio: HTMLAudioElement,
    baseVolume: number,
    fadeStartFraction: number
): () => void {
    const fadeStart = clamp01(fadeStartFraction, 1);
    if (fadeStart >= 1) {
        return () => { };
    }

    // 后台标签页会限流定时器，淡出变得粗糙但不影响功能
    const stepMs = 40;
    const timer = setInterval(() => {
        const { duration, currentTime } = audio;
        if (!isFinite(duration) || duration <= 0 || !isFinite(currentTime)) {
            return;
        }
        if (audio.ended || currentTime >= duration) {
            clearInterval(timer);
            return;
        }

        const fadeStartTime = duration * fadeStart;
        if (currentTime < fadeStartTime) {
            return;
        }

        const fadeRemain = duration - fadeStartTime;
        const fadeProgress = fadeRemain > 0 ? (currentTime - fadeStartTime) / fadeRemain : 1;
        audio.volume = Math.max(0, baseVolume * (1 - fadeProgress));
    }, stepMs);

    return () => clearInterval(timer);
}
