import { Category, CategorySelection, CategorySkipOption } from '../types';

/** Apply the upgrade once, so disabling padding afterwards survives the next startup. */
export function migratePaddingCategory(config: { categorySelections: CategorySelection[]; paddingCategoryMigrated: boolean }): void {
    if (config.paddingCategoryMigrated) return;
    if (!config.categorySelections.some(selection => selection.name === 'padding')) {
        config.categorySelections = [...config.categorySelections, { name: 'padding' as Category, option: CategorySkipOption.AutoSkip }];
    }
    config.paddingCategoryMigrated = true;
}
