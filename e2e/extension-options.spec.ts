import type { Page, Worker } from "@playwright/test";
import { expect, test } from "./fixtures/extension";
import { readLocalStorage, readSyncStorage, writeLocalStorage, writeSyncStorage } from "./support/extensionStorage";

const fullBackendCapabilities = [
    "GET /api/skipSegments",
    "GET /api/skipSegments/:sha256HashPrefix",
    "POST /api/skipSegments",
    "POST /api/voteOnSponsorTime",
    "POST /api/viewedVideoSponsorTime",
    "GET /api/lockCategories",
    "GET /api/lockCategories/:sha256HashPrefix",
    "GET /api/videoLabels",
    "GET /api/videoLabels/:sha256HashPrefix",
    "GET /api/portVideo",
    "GET /api/portVideo/:sha256HashPrefix",
    "POST /api/portVideo",
    "POST /api/votePort",
    "POST /api/updatePortedSegments",
    "GET /api/chapterNames",
    "GET /api/userInfo",
    "POST /api/setUsername",
    "GET /api/getUsername",
    "POST /api/warnUser",
];

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

test("shows backend nodes as individual rows and removes one mirror", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    const backendConfig = {
        backends: [
            {
                id: "main",
                name: "Main",
                api_url: "https://www.bsbsb.top",
                capabilities: fullBackendCapabilities,
                mirrors: [
                    "https://www.bsbsb.xyz",
                    "http://103.236.70.57:9876",
                    "http://mirror-community.test:9876",
                ],
            },
        ],
    };
    await writeLocalStorage(extensionServiceWorker, { backendConfig });
    await openOptions(extensionPage, extensionId, "#backend-config");

    const mainRow = extensionPage.locator(".backend-config-table tbody tr").filter({ hasText: "main" });
    await expect(mainRow.locator("[data-backend-node='main']")).toHaveCount(4);
    const communityMirror = mainRow.locator("[data-backend-node='main'][data-address='http://mirror-community.test:9876']");
    await communityMirror.locator("[data-backend-action='remove']").click();

    await expect
        .poll(async () => {
            const saved = await readLocalStorage<{ backends: Array<{ id: string; mirrors?: string[] }> }>(
                extensionServiceWorker,
                "backendConfig"
            );
            return saved.backends.find((backend) => backend.id === "main")?.mirrors;
        })
        .toEqual(["https://www.bsbsb.xyz", "http://103.236.70.57:9876"]);
    await expect(mainRow.locator("[data-backend-node='main']")).toHaveCount(3);
});

test("keeps node health controls inside the backend configuration", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await openOptions(extensionPage, extensionId, "#backend-config");
    const mainRow = extensionPage.locator(".backend-config-table tbody tr").filter({ hasText: "main" });
    await expect(mainRow.locator("[data-backend-node='main'][data-role='primary']")).toHaveCount(1);
    await expect(mainRow.locator("[data-backend-action='check']")).toHaveCount(3);
    await expect(mainRow.locator("[data-backend-action='remove']")).toHaveCount(2);
    await expect(extensionPage.locator("#backendConfigJson")).toBeVisible();
    await expectSyncStorage(extensionServiceWorker, "userID", "00000000-0000-4000-8000-000000000001");
});

test("falls back to a configured mirror for a write request", async ({
    extensionContext,
    extensionId,
    extensionPage,
}) => {
    const endpoint = "/api/voteOnSponsorTime";
    const requestedAddresses: string[] = [];
    await extensionContext.unroute("https://www.bsbsb.top/**");
    await extensionContext.route(`https://www.bsbsb.top${endpoint}`, async (route) => {
        requestedAddresses.push("https://www.bsbsb.top");
        await route.fulfill({ status: 503, body: "Unavailable" });
    });
    await extensionContext.route(`https://www.bsbsb.xyz${endpoint}`, async (route) => {
        requestedAddresses.push("https://www.bsbsb.xyz");
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await openOptions(extensionPage, extensionId, "#backend-config");

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
    expect(response.status).toBe(200);
    expect(requestedAddresses).toEqual(["https://www.bsbsb.top", "https://www.bsbsb.xyz"]);
});

test("uses a later mirror when earlier nodes fail a hash request", async ({
    extensionContext,
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await openOptions(extensionPage, extensionId, "#backend-config");

    const endpoint = "/api/skipSegments/abcd";
    const requestedAddresses: string[] = [];
    const responses = [
        ["https://www.bsbsb.top", 503, "Unavailable"],
        ["https://www.bsbsb.xyz", 503, "Unavailable"],
        ["http://103.236.70.57:9876", 200, "[]"],
    ] as const;

    const requiredHostPermissions = await extensionServiceWorker.evaluate(async () => {
        const origins = [
            "https://www.bsbsb.top/*",
            "https://www.bsbsb.xyz/*",
            "http://103.236.70.57/*",
        ];
        return Promise.all(
            origins.map(
                (origin) =>
                    new Promise<boolean>((resolve) => {
                        chrome.permissions.contains({ origins: [origin], permissions: [] }, resolve);
                    })
            )
        );
    });
    expect(requiredHostPermissions).toEqual([false, false, false]);

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

});

test("retries a safe read on only one mirror", async ({ extensionContext, extensionId, extensionPage }) => {
    await openOptions(extensionPage, extensionId, "#backend-config");

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
