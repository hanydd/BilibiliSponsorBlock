import { resolvePlaybackBehavior } from '../src/config/playbackBehavior';
import { ActionType, Category, CategorySkipOption } from '../src/types';

test.each([ActionType.Mute, ActionType.Skip])('jumpscare projects %s without changing stored data', actionType => {
    const segment = Object.freeze({ category: 'jumpscare' as Category, actionType });
    for (const option of [CategorySkipOption.Disabled, CategorySkipOption.ShowOverlay, CategorySkipOption.ManualSkip, CategorySkipOption.AutoSkip]) {
        expect(resolvePlaybackBehavior(segment, option, true)).toEqual({ action: ActionType.Skip, option, protectiveMute: false });
    }
    expect(resolvePlaybackBehavior(segment, CategorySkipOption.AutoMute, true)).toEqual({ action: ActionType.Mute, option: CategorySkipOption.AutoSkip, protectiveMute: true });
    expect(resolvePlaybackBehavior(segment, CategorySkipOption.AutoMute, false)).toEqual({ action: ActionType.Skip, option: CategorySkipOption.ManualSkip, protectiveMute: false });
    expect(segment.actionType).toBe(actionType);
});
test('ordinary mute retains its original behavior', () => {
    expect(resolvePlaybackBehavior({ category: 'sponsor' as Category, actionType: ActionType.Mute }, CategorySkipOption.ManualSkip, true)).toEqual({ action: ActionType.Mute, option: CategorySkipOption.ManualSkip, protectiveMute: false });
});
