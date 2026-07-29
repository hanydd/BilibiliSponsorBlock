import type { Page, Worker } from "@playwright/test";
import { expect, test } from "./fixtures/extension";
import { readSyncStorage, writeSyncStorage } from "./support/extensionStorage";

async function openOptions(page: Page, extensionId: string, hash = ""): Promise<void> {
    await page.goto(`chrome-extension://${extensionId}/options/options.html${hash}`);
    await expect(page.locator("#options-container")).toBeVisible();
    await expect(page.locator(`#${hash.slice(1) || "behavior"}`)).toBeVisible();
}

async function expectSyncStorage<T>(serviceWorker: Worker, key: string, expected: T): Promise<void> {
    await expect.poll(() => readSyncStorage<T>(serviceWorker, key)).toEqual(expected);
}

test("loads the options page and keeps tab navigation in the URL", async ({ extensionId, extensionPage }) => {
    await openOptions(extensionPage, extensionId);

    await expect(extensionPage.locator("#version")).toContainText(/^v\. /);
    await expect(extensionPage.locator("[data-for='behavior']")).toHaveClass(/selected/);
    await expect(extensionPage.locator("#behavior")).toBeVisible();

    await extensionPage.locator("[data-for='interface']").click();
    await expect(extensionPage).toHaveURL(/#interface$/);
    await expect(extensionPage.locator("[data-for='interface']")).toHaveClass(/selected/);
    await expect(extensionPage.locator("#interface")).toBeVisible();
    await expect(extensionPage.locator("#behavior")).toBeHidden();

    await extensionPage.reload();
    await expect(extensionPage.locator("[data-for='interface']")).toHaveClass(/selected/);
    await expect(extensionPage.locator("#interface")).toBeVisible();
});

test("persists common interface toggles, numeric values, and selectors", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await openOptions(extensionPage, extensionId, "#interface");

    await extensionPage.locator("label[for='darkMode']").click();
    await expect(extensionPage.locator("html")).toHaveAttribute("data-theme", "light");
    await expectSyncStorage(extensionServiceWorker, "darkMode", false);

    const durationInput = extensionPage.locator("[data-sync='skipNoticeDuration'] input");
    await durationInput.fill("8");
    await expectSyncStorage(extensionServiceWorker, "skipNoticeDuration", "8");

    await extensionPage.locator("#noticeVisibilityMode").selectOption("4");
    await expectSyncStorage(extensionServiceWorker, "noticeVisibilityMode", 4);

    await extensionPage.reload();
    await expect(extensionPage.locator("#darkMode")).not.toBeChecked();
    await expect(durationInput).toHaveValue("8");
    await expect(extensionPage.locator("#noticeVisibilityMode")).toHaveValue("4");
});

test("changes and persists a category skip policy", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await openOptions(extensionPage, extensionId);

    const sponsorPolicy = extensionPage.locator("#sponsorSkipOption select");
    await expect(sponsorPolicy).toHaveValue("autoSkip");
    await sponsorPolicy.selectOption("manualSkip");

    await expect
        .poll(async () => {
            const selections = await readSyncStorage<Array<{ name: string; option: number }>>(
                extensionServiceWorker,
                "categorySelections"
            );
            return selections.find((selection) => selection.name === "sponsor")?.option;
        })
        .toBe(1);

    await extensionPage.reload();
    await expect(sponsorPolicy).toHaveValue("manualSkip");
});

test("edits and persists a player keyboard shortcut", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await openOptions(extensionPage, extensionId, "#keybinds");

    await extensionPage.locator("[data-sync='startSponsorKeybind'] .keybind-buttons").click();
    await expect(extensionPage.locator("#keybind-dialog .dialog")).toBeVisible();
    await extensionPage.keyboard.press("k");
    await extensionPage.locator("#keybind-dialog .save-button").click();

    await expect
        .poll(() => readSyncStorage<{ key: string; code: string }>(extensionServiceWorker, "startSponsorKeybind"))
        .toMatchObject({ key: "k", code: "KeyK" });

    await extensionPage.reload();
    await expect(extensionPage.locator("[data-sync='startSponsorKeybind'] .keyBase")).toHaveText("K");
});

test("removes individual channels and clears the whitelist", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await writeSyncStorage(extensionServiceWorker, {
        whitelistedChannels: [
            { id: "1001", name: "Mock Channel A" },
            { id: "1002", name: "Mock Channel B" },
        ],
    });
    await openOptions(extensionPage, extensionId, "#experiment");

    const manager = extensionPage.locator("[data-type='react-WhitelistManagerComponent']");
    await expect(manager).toContainText("Mock Channel A");
    await expect(manager).toContainText("Mock Channel B");

    extensionPage.once("dialog", (dialog) => dialog.accept());
    await manager.getByRole("row").filter({ hasText: "Mock Channel A" }).locator(".option-button").click();
    await expect
        .poll(() => readSyncStorage<Array<{ id: string }>>(extensionServiceWorker, "whitelistedChannels"))
        .toEqual([{ id: "1002", name: "Mock Channel B" }]);
    await expect(manager).not.toContainText("Mock Channel A");

    extensionPage.once("dialog", (dialog) => dialog.accept());
    await manager.locator(":scope > .option-button").click();
    await expectSyncStorage(extensionServiceWorker, "whitelistedChannels", []);
    await expect(manager).not.toContainText("Mock Channel B");
});
