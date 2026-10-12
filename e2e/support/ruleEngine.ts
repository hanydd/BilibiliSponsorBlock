import type { Page } from '@playwright/test';

/** Exercise the public entry/exit locations without changing engine configuration directly. */
export async function toggleRuleEngine(page: Page): Promise<void> {
    if (await page.locator('#rule-engine-enabled').isChecked()) {
        await page.locator('[data-for="behavior"]').click();
        await page.locator('#rule-engine-disable').click();
    } else {
        await page.locator('[data-for="experiment"]').click();
        await page.locator('label[for="rule-engine-enabled"]').click();
        await page.locator('[data-for="behavior"]').click();
    }
}
