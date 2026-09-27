import Config from '../config';

let lastPlayed = -Infinity;

/** Shared notification for automatic skip/fast-forward; audio failure must not stop playback logic. */
export function notifyAutomaticSkip(video: HTMLVideoElement): void {
    if (!video || video.muted || !Config.config.audioNotificationOnSkip || performance.now() - lastPlayed < 50) return;
    lastPlayed = performance.now();
    try {
        const beep = new Audio(chrome.runtime.getURL('icons/beep.ogg'));
        beep.volume = video.volume * 0.1;
        const oldMetadata = navigator.mediaSession?.metadata;
        beep.addEventListener('ended', () => {
            if (navigator.mediaSession) navigator.mediaSession.metadata = oldMetadata;
            beep.remove();
        }, { once: true });
        void beep.play().catch(() => beep.remove());
    } catch { /* Reloaded extensions and blocked audio must not affect skipping. */ }
}
