import { categoryList } from '../config.json';
import { isCategoryEnabled, migrateCategorySelections, setCategorySelection } from '../src/config/categoryConfig';
import { Category, CategorySelection, CategorySkipOption } from '../src/types';

const categories = categoryList as Category[];
const optionFor = (config: { categorySelections: CategorySelection[] }, name: string) => config.categorySelections.find(s => s.name === name)?.option;

test('ambiguous old padding is upgraded once; other absent categories retain their disabled behavior', () => {
    const original: CategorySelection[] = [{ name: 'sponsor' as Category, option: CategorySkipOption.ManualSkip }];
    const config = { categorySelections: original, paddingCategoryMigrated: false };
    migrateCategorySelections(config, categories);
    expect(optionFor(config, 'padding')).toBe(CategorySkipOption.AutoSkip);
    expect(optionFor(config, 'sponsor')).toBe(CategorySkipOption.ManualSkip);
    for (const category of categories.filter(c => !['padding', 'sponsor'].includes(c))) expect(optionFor(config, category)).toBe(CategorySkipOption.Disabled);
    expect(original).toHaveLength(1);
    const migrated = config.categorySelections;
    migrateCategorySelections(config, categories);
    expect(config.categorySelections).toBe(migrated);
});

test.each([CategorySkipOption.AutoSkip, CategorySkipOption.ManualSkip, CategorySkipOption.ShowOverlay, CategorySkipOption.Disabled])(
    'preserves an explicit padding choice %s', option => {
        const config = { categorySelections: [{ name: 'padding', option }] as CategorySelection[], paddingCategoryMigrated: false };
        migrateCategorySelections(config, categories);
        expect(optionFor(config, 'padding')).toBe(option);
    }
);

test('the previous migration marker preserves the old settings page deletion form of disable', () => {
    const config = { categorySelections: [] as CategorySelection[], paddingCategoryMigrated: true };
    migrateCategorySelections(config, categories);
    expect(optionFor(config, 'padding')).toBe(CategorySkipOption.Disabled);
});

test.each(categories)('explicit disabling of %s survives migration and re-enabling uses the same record', category => {
    const config = { categorySelections: setCategorySelection([], category, CategorySkipOption.Disabled), paddingCategoryMigrated: false };
    migrateCategorySelections(config, categories);
    expect(optionFor(config, category)).toBe(CategorySkipOption.Disabled);
    expect(isCategoryEnabled(config.categorySelections.find(s => s.name === category))).toBe(false);
    config.categorySelections = setCategorySelection(config.categorySelections, category, CategorySkipOption.ManualSkip);
    expect(optionFor(config, category)).toBe(CategorySkipOption.ManualSkip);
    expect(config.categorySelections.filter(s => s.name === category)).toHaveLength(1);
    expect(isCategoryEnabled(config.categorySelections.find(s => s.name === category))).toBe(true);
});

test('only configured, non-disabled categories participate in playback, labels and submission choices', () => {
    expect(isCategoryEnabled(undefined)).toBe(false);
    for (const option of [CategorySkipOption.Disabled, CategorySkipOption.ShowOverlay, CategorySkipOption.ManualSkip, CategorySkipOption.AutoSkip]) {
        expect(isCategoryEnabled({ name: 'sponsor' as Category, option })).toBe(option !== CategorySkipOption.Disabled);
    }
});
