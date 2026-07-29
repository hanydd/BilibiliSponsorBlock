import { expect, test } from "./fixtures/extension";

test("loads the extension options page", async ({ extensionId, extensionPage }) => {
    await extensionPage.goto(`chrome-extension://${extensionId}/options/options.html`);

    await expect(extensionPage.locator("#options-container")).toBeVisible();
    await expect(extensionPage.locator("#version")).toContainText(/^v\. /);
    await expect(extensionPage.locator("[data-for='behavior']")).toHaveClass(/selected/);
});
