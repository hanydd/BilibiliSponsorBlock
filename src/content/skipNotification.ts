import Config from '../config';
import { applyFadeOut, clamp01 } from '../utils/soundFade';

let lastPlayed = -Infinity;

/** Shared notification for automatic skip/fast-forward; audio failure must not stop playback logic. */
export function notifyAutomaticSkip(video: HTMLVideoElement): void {
    if (!video || video.muted || !Config.config.audioNotificationOnSkip || performance.now() - lastPlayed < 50) return;
    lastPlayed = performance.now();
    let cleanup = () => {};
    try {
        const beep = new Audio(Config.local?.customSkipSound?.dataUrl || chrome.runtime.getURL('icons/beep.ogg'));
        const volume = clamp01(Config.config.skipSoundVolume, 0.1);
        beep.volume = volume;
        const stopFade = applyFadeOut(beep, volume, Config.config.skipSoundFadeStart);
        cleanup = () => { stopFade(); beep.remove(); };
        const oldMetadata = navigator.mediaSession?.metadata;
        beep.addEventListener('ended', () => {
            if (navigator.mediaSession) navigator.mediaSession.metadata = oldMetadata;
            cleanup();
        }, { once: true });
        beep.addEventListener('error', cleanup, { once: true });
        void beep.play().catch(cleanup);
    } catch { cleanup(); /* Reloaded extensions and blocked audio must not affect skipping. */ }
}
