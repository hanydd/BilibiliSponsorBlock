import type { Page } from '@playwright/test';

/** Exercise the legacy switch without changing engine configuration directly. */
export async function toggleRuleEngine(page: Page): Promise<void> {
    await page.locator('[data-for="experiment"]').click();
    await page.locator('label[for="legacy-engine-enabled"]').click();
    await page.locator('[data-for="behavior"]').click();
}
