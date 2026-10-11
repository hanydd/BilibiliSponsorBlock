import { ActionType, CategorySkipOption, SponsorTime } from '../types';

/** Runtime projection only: never replace the stored or submitted action. */
export function resolvePlaybackBehavior(segment: Pick<SponsorTime, 'category' | 'actionType'>, option: CategorySkipOption, muteEnabled: boolean) {
    if (segment.category !== 'jumpscare') return { action: segment.actionType, option, protectiveMute: false };
    const protectiveMute = option === CategorySkipOption.AutoMute && muteEnabled;
    return { action: protectiveMute ? ActionType.Mute : ActionType.Skip,
        option: option === CategorySkipOption.AutoMute ? (muteEnabled ? CategorySkipOption.AutoSkip : CategorySkipOption.ManualSkip) : option,
        protectiveMute };
}
