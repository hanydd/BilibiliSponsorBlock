import { migratePaddingCategory } from '../src/config/categoryConfig';
import { Category, CategorySelection, CategorySkipOption } from '../src/types';

test('old category lists without padding gain automatic padding once', () => {
    const original: CategorySelection[] = [{ name: 'sponsor' as Category, option: CategorySkipOption.ManualSkip }];
    const config = { categorySelections: original, paddingCategoryMigrated: false };
    migratePaddingCategory(config);
    expect(config.categorySelections).toEqual([...original, { name: 'padding', option: CategorySkipOption.AutoSkip }]);
    expect(original).toHaveLength(1);
    expect(config.paddingCategoryMigrated).toBe(true);
    // Disabling it after upgrading removes the entry. A later startup must respect that choice.
    config.categorySelections = config.categorySelections.filter(s => s.name !== 'padding');
    migratePaddingCategory(config);
    expect(config.categorySelections).toEqual(original);
});

test.each([CategorySkipOption.AutoSkip, CategorySkipOption.ManualSkip, CategorySkipOption.ShowOverlay, CategorySkipOption.Disabled])(
    'migration preserves an explicitly configured padding option %s', option => {
        const config = { categorySelections: [{ name: 'padding', option }] as CategorySelection[], paddingCategoryMigrated: false };
        migratePaddingCategory(config);
        migratePaddingCategory(config);
        expect(config.categorySelections).toEqual([{ name: 'padding', option }]);
        expect(config.paddingCategoryMigrated).toBe(true);
    }
);
