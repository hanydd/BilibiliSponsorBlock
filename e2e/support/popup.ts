import type { FrameLocator, Page } from "@playwright/test";
import { expect } from "../fixtures/extension";

export async function openEmbeddedPopup(page: Page): Promise<FrameLocator> {
    await page.bringToFront();
    const infoButton = page.locator("#infoButton");
    await expect(infoButton).toBeVisible();
    await infoButton.click();

    const popupContainer = page.locator("#sponsorBlockPopupContainer");
    await expect(popupContainer).toHaveCount(1);

    const popup = page.frameLocator("#sponsorBlockPopupContainer iframe");
    await expect(popup.locator("#sponsorblockPopup")).toBeVisible();
    return popup;
}
