import { Category, CategorySelection, CategorySkipOption } from '../types';

/** Missing old entries and explicit Disabled both mean disabled when reading preferences. */
export function isCategoryEnabled(selection: CategorySelection | undefined): boolean {
    return selection !== undefined && selection.option !== CategorySkipOption.Disabled;
}

/** Store every user choice, including Disabled, in the same category record. */
export function setCategorySelection(selections: readonly CategorySelection[], name: Category, option: CategorySkipOption): CategorySelection[] {
    return selections.some(selection => selection.name === name)
        ? selections.map(selection => selection.name === name ? { ...selection, option } : selection)
        : [...selections, { name, option }];
}

export function migrateCategorySelections(config: { categorySelections: CategorySelection[]; paddingCategoryMigrated: boolean }, categories: readonly Category[]): void {
    let selections = config.categorySelections;
    // Before this migration, absence cannot distinguish an old default from a user disable.
    // After the old one-time marker, even an absent padding entry must remain disabled.
    if (!config.paddingCategoryMigrated && !selections.some(selection => selection.name === 'padding')) {
        selections = setCategorySelection(selections, 'padding' as Category, CategorySkipOption.AutoSkip);
    }
    // Record the effective choice for every known category. Future upgrades can then
    // distinguish existing disabled categories from genuinely new, unconfigured ones.
    for (const category of categories) {
        if (!selections.some(selection => selection.name === category)) {
            selections = setCategorySelection(selections, category, CategorySkipOption.Disabled);
        }
    }
    if (selections !== config.categorySelections) config.categorySelections = selections;
    config.paddingCategoryMigrated = true;
}
