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

test("shows mirror servers as individual rows and removes one", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await writeSyncStorage(extensionServiceWorker, {
        mirrorServerAddresses: [
            "https://www.bsbsb.xyz",
            "http://103.236.70.57:9876",
            "http://mirror-community.test:9876/",
        ],
    });
    await openOptions(extensionPage, extensionId, "#advanced");

    const settings = extensionPage.locator(".server-settings");
    const mirrorContent = settings.locator("#serverMirrorContent");
    const mirrorToggle = settings.locator("#serverMirrorToggle");
    await expect(settings).toBeVisible();
    await expect(mirrorContent).toBeHidden();
    await expect(mirrorToggle.locator(".server-mirror-caret")).toHaveText("▶");
    await mirrorToggle.click();
    await expect(mirrorContent).toBeVisible();
    await expect(mirrorToggle.locator(".server-mirror-caret")).toHaveText("▼");
    const actionRightEdges = await Promise.all([
        settings.locator(".server-primary-row .text-change-reset").evaluate((element) => element.getBoundingClientRect().right),
        settings.locator(".server-list-reset").evaluate((element) => element.getBoundingClientRect().right),
        settings.locator(".server-node-row").first().locator("[data-server-action='remove']").evaluate(
            (element) => element.getBoundingClientRect().right
        ),
    ]);
    expect(Math.max(...actionRightEdges) - Math.min(...actionRightEdges)).toBeLessThanOrEqual(1);
    await expect(settings.locator("textarea")).toHaveCount(0);
    await expect(settings.locator(".server-node-row")).toHaveCount(3);
    await expect(settings.locator("#serverNodeCount")).toContainText("3");
    await expect(settings.locator(".server-node-badge.official")).toHaveCount(2);
    await expect(settings.locator(".server-node-badge.community")).toHaveCount(1);

    const communityMirror = settings.locator(".server-node-row").filter({ hasText: "mirror-community.test" });
    await communityMirror.locator("[data-server-action='remove']").click();

    await expectSyncStorage(extensionServiceWorker, "mirrorServerAddresses", [
        "https://www.bsbsb.xyz",
        "http://103.236.70.57:9876",
    ]);
    await expect(settings.locator(".server-node-row")).toHaveCount(2);
});

test("checks an edited primary server before saving it", async ({
    extensionContext,
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await openOptions(extensionPage, extensionId, "#advanced");

    const primaryRow = extensionPage.locator("#primaryServerRow");
    const input = primaryRow.locator(".server-address-input");
    const checkButton = primaryRow.locator("#refreshPrimaryServerStatus");
    const saveButton = primaryRow.locator(".text-change-set");
    const health = primaryRow.locator("#primaryServerHealth");
    const currentAddress = (await input.inputValue()).replace(/\/+$/, "");
    const draftAddress = `${currentAddress}/draft`;
    let readyRequests = 0;

    await extensionContext.route(`${draftAddress}/api/ready`, async (route) => {
        readyRequests += 1;
        await route.fulfill({ status: 200, body: "OK" });
    });

    await expect(saveButton).toBeDisabled();
    await input.fill(`${draftAddress}/`);
    await expect(saveButton).toBeEnabled();
    await expect(health).toHaveText("状态未知");
    await expect(primaryRow).not.toHaveClass(/available/);

    await checkButton.click();

    await expect(health).toHaveText("可用");
    await expect(primaryRow).toHaveCSS("border-left-color", "rgb(82, 199, 122)");
    await expect(primaryRow).toHaveCSS("border-image-source", "none");
    await expect(input).toHaveValue(draftAddress);
    expect(readyRequests).toBe(1);
    expect(await readSyncStorage<string>(extensionServiceWorker, "serverAddress")).not.toBe(draftAddress);

    await saveButton.click();
    await expectSyncStorage(extensionServiceWorker, "serverAddress", draftAddress);
    await expectSyncStorage(extensionServiceWorker, "mirrorServerAddresses", []);
    await expect(saveButton).toBeDisabled();
});

test("updates the primary server state bar while checking", async ({
    extensionContext,
    extensionId,
    extensionPage,
}) => {
    await openOptions(extensionPage, extensionId, "#advanced");

    const primaryRow = extensionPage.locator("#primaryServerRow");
    const health = primaryRow.locator("#primaryServerHealth");
    const address = (await primaryRow.locator(".server-address-input").inputValue()).replace(/\/+$/, "");
    let releaseReadyRequest: () => void;
    const readyRequestGate = new Promise<void>((resolve) => {
        releaseReadyRequest = resolve;
    });

    await expect(primaryRow).toHaveCSS("border-left-color", "rgb(82, 199, 122)");
    await extensionContext.unroute("https://www.bsbsb.top/**");
    await extensionContext.route(`${address}/api/ready`, async (route) => {
        await readyRequestGate;
        await route.fulfill({ status: 503, body: "Unavailable" });
    });

    await primaryRow.locator("#refreshPrimaryServerStatus").click();
    await expect(health).toHaveText("检测中");
    await expect(primaryRow).toHaveCSS("border-left-color", "rgb(214, 168, 75)");
    await expect(primaryRow).toHaveCSS("border-image-source", "none");

    releaseReadyRequest();
    await expect(health).toHaveText("不可用");
    await expect(primaryRow).toHaveCSS("border-left-color", "rgb(224, 108, 117)");
    await expect(primaryRow).toHaveCSS("border-image-source", "none");
});

test("highlights the active node without a current-node marker", async ({ extensionId, extensionPage }) => {
    await openOptions(extensionPage, extensionId, "#advanced");
    await expect(extensionPage.locator("#primaryServerRow")).toHaveClass(/active/);
    await expect(extensionPage.locator(".server-current-node")).toHaveCount(0);
});

test("updates node status when a background request opens the circuit", async ({
    extensionContext,
    extensionId,
    extensionPage,
}) => {
    await openOptions(extensionPage, extensionId, "#advanced");

    const primaryRow = extensionPage.locator("#primaryServerRow");
    await expect(primaryRow.locator("#primaryServerHealth")).toHaveText("可用");

    const endpoint = "/api/voteOnSponsorTime";
    await extensionContext.unroute("https://www.bsbsb.top/**");
    await extensionContext.route(`https://www.bsbsb.top${endpoint}`, async (route) => {
        await route.fulfill({ status: 503, body: "Unavailable" });
    });

    const response = await extensionPage.evaluate(
        (requestEndpoint) =>
            new Promise<{ status: number }>((resolve) => {
                chrome.runtime.sendMessage(
                    {
                        message: "sendRequest",
                        type: "POST",
                        endpoint: requestEndpoint,
                        data: { UUID: "test" },
                        headers: {},
                    },
                    resolve
                );
            }),
        endpoint
    );
    expect(response.status).toBe(503);

    await expect(primaryRow.locator("#primaryServerHealth")).toHaveText("不可用");
    await expect(primaryRow).toHaveCSS("border-left-color", "rgb(224, 108, 117)");
    await expect(primaryRow).not.toHaveClass(/active/);

    await extensionPage.locator("#serverMirrorToggle").click();
    await expect(
        extensionPage.locator(".server-node-row").filter({ hasText: "https://www.bsbsb.xyz" })
    ).toHaveClass(/active/);
});

test("uses a later mirror when earlier nodes fail a hash request", async ({
    extensionContext,
    extensionId,
    extensionPage,
}) => {
    await openOptions(extensionPage, extensionId, "#advanced");

    const endpoint = "/api/skipSegments/abcd";
    const requestedAddresses: string[] = [];
    const responses = [
        ["https://www.bsbsb.top", 503, "Unavailable"],
        ["https://www.bsbsb.xyz", 503, "Unavailable"],
        ["http://103.236.70.57:9876", 200, "[]"],
    ] as const;

    await extensionContext.unroute("https://www.bsbsb.top/**");
    for (const [address, status, body] of responses) {
        await extensionContext.route(`${address}${endpoint}`, async (route) => {
            requestedAddresses.push(address);
            await route.fulfill({ status, contentType: "application/json", body });
        });
    }

    const response = await extensionPage.evaluate(
        (requestEndpoint) =>
            new Promise<{ status: number }>((resolve) => {
                chrome.runtime.sendMessage(
                    {
                        message: "sendRequest",
                        type: "GET",
                        endpoint: requestEndpoint,
                        data: {},
                        headers: {},
                    },
                    resolve
                );
            }),
        endpoint
    );

    expect(response.status).toBe(200);
    expect(requestedAddresses).toEqual(responses.map(([address]) => address));

    await extensionPage.locator("#serverMirrorToggle").click();
    await expect(
        extensionPage.locator(".server-node-row").filter({ hasText: "103.236.70.57:9876" })
    ).toHaveClass(/active/);
});

test("retries a safe read on only one mirror", async ({ extensionContext, extensionId, extensionPage }) => {
    await openOptions(extensionPage, extensionId, "#advanced");

    const endpoint = "/api/chapterNames";
    const requestedAddresses: string[] = [];
    const responses = [
        ["https://www.bsbsb.top", 503],
        ["https://www.bsbsb.xyz", 200],
    ] as const;

    await extensionContext.unroute("https://www.bsbsb.top/**");
    for (const [address, status] of responses) {
        await extensionContext.route(`${address}${endpoint}**`, async (route) => {
            requestedAddresses.push(address);
            await route.fulfill({ status, contentType: "application/json", body: "[]" });
        });
    }

    const response = await extensionPage.evaluate(
        (requestEndpoint) =>
            new Promise<{ status: number }>((resolve) => {
                chrome.runtime.sendMessage(
                    {
                        message: "sendRequest",
                        type: "GET",
                        endpoint: requestEndpoint,
                        data: { description: "test", channelID: "1" },
                        headers: {},
                    },
                    resolve
                );
            }),
        endpoint
    );

    expect(response.status).toBe(200);
    expect(requestedAddresses).toEqual(responses.map(([address]) => address));
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
