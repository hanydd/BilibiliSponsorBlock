import { expect, test } from "./fixtures/extension";

test("cache cleanup shows the browser error and succeeds after storage recovers", async ({
    extensionId, extensionPage, extensionServiceWorker,
}) => {
    await extensionPage.goto(`chrome-extension://${extensionId}/options/options.html#experiment`);
    const clearButton = extensionPage.locator("#clearAllCache");
    await expect(clearButton).toBeVisible();
    await expect(extensionPage.locator("#message-button")).toBeAttached();
    const messages = await extensionPage.evaluate(() => ({
        failure: chrome.i18n.getMessage("clearAllCacheFailed"),
        success: chrome.i18n.getMessage("clearAllCacheSuccess"),
    }));

    // Reproduce Firefox's generic storage error in the background callback.
    await extensionServiceWorker.evaluate(() => {
        const original = chrome.storage.local.remove;
        (globalThis as unknown as { restoreCacheRemove: () => void }).restoreCacheRemove = () => {
            chrome.storage.local.remove = original;
        };
        Object.defineProperty(chrome.storage.local, "remove", {
            configurable: true,
            writable: true,
            value: (_keys: string | string[], callback: () => void) => {
                const descriptor = Object.getOwnPropertyDescriptor(chrome.runtime, "lastError");
                Object.defineProperty(chrome.runtime, "lastError", {
                    configurable: true, value: { message: "An unexpected error occurred" },
                });
                try {
                    callback();
                } finally {
                    if (descriptor) Object.defineProperty(chrome.runtime, "lastError", descriptor);
                    else Reflect.deleteProperty(chrome.runtime, "lastError");
                }
            },
        });
    });

    extensionPage.on("dialog", dialog => dialog.accept());
    await clearButton.click();
    await expect(extensionPage.locator(".ant-message-error")).toContainText(
        `${messages.failure}: An unexpected error occurred`
    );
    await expect(extensionPage.locator(".ant-message-success")).toHaveCount(0);

    await extensionServiceWorker.evaluate(() => {
        (globalThis as unknown as { restoreCacheRemove: () => void }).restoreCacheRemove();
    });
    await clearButton.click();
    await expect(extensionPage.locator(".ant-message-success")).toContainText(messages.success);
});
