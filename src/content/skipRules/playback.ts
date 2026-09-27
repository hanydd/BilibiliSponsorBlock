import { RuleInput, RuleSegment } from './types';

/** The method is independent of whether this visit currently permits automatic execution. */
export function playbackMethod(segment: RuleSegment, input: Pick<RuleInput, 'speedUp'>): 'seek' | 'speed' | 'mute' {
    if (segment.action === 'mute') return 'mute';
    return input.speedUp && segment.end - segment.start >= 0.5 && !segment.draft ? 'speed' : 'seek';
}

export function canAutomaticallyPlay(input: Pick<RuleInput, 'paused' | 'waiting'>): boolean {
    return !input.paused && !input.waiting;
}

/** Preserve the extension's rate calculation, including the equal-baseline case. */
export function speedUpTarget(original: number, configuredRate: number): number {
    const configured = Math.min(16, Math.max(1.1, Number(configuredRate) || 2));
    return Math.min(16, Math.abs(configured - original) <= 0.05 ? original + configured : Math.max(configured, original));
}
