import { toggleRuleEngine } from './support/ruleEngine';
import type { Page, Worker } from "@playwright/test";
import path from "path";
import { expect, test } from "./fixtures/extension";
import { readLocalStorage, readSyncStorage, writeSyncStorage } from "./support/extensionStorage";

// Health-check UI tests should not open Chrome's optional host-permission prompt.
const permittedTestServerAddress = "http://server-e2e.bsbsb.top";
const activeServerAnimationName = "server-node-active-breathe";

async function openOptions(page: Page, extensionId: string, hash = ""): Promise<void> {
    await page.goto(`chrome-extension://${extensionId}/options/options.html${hash}`);
    await expect(page.locator("#options-container")).toBeVisible();
    await expect(page.locator(`#${hash.slice(1) || "behavior"}`)).toBeVisible();
}

async function expectSyncStorage<T>(serviceWorker: Worker, key: string, expected: T): Promise<void> {
    await expect.poll(() => readSyncStorage<T>(serviceWorker, key)).toEqual(expected);
}

/** 生成指定秒数的静音 PCM WAV，用于构造超时长限制的音效文件 */
function buildWavBuffer(durationSeconds: number): Buffer {
    const sampleRate = 8000;
    const dataSize = sampleRate * durationSeconds * 2;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);
    return buffer;
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

test("disables skipping after seeking by default and preserves an enabled preference", async ({
    extensionId, extensionPage, extensionServiceWorker,
}) => {
    await openOptions(extensionPage, extensionId);
    await expect(extensionPage.locator("#skipOnSeekToSegment")).not.toBeChecked();

    await writeSyncStorage(extensionServiceWorker, { skipOnSeekToSegment: true });
    await extensionPage.reload();
    await expect(extensionPage.locator("#skipOnSeekToSegment")).toBeChecked();
    await expectSyncStorage(extensionServiceWorker, "skipOnSeekToSegment", true);
});

for (const mode of ["legacy", "rules"]) {
test(`customizes the skip sound in ${mode} settings only while audio notifications are enabled`, async ({
    extensionId, extensionPage, extensionServiceWorker,
}) => {
    await openOptions(extensionPage, extensionId);

    if (mode === "rules") {
        await toggleRuleEngine(extensionPage);
        await extensionPage.locator('#rules-tab-cards').click();
    }
    const block = extensionPage.locator("[data-type='custom-skip-sound']");
    await expect(block).toHaveCount(1);
    await expect(extensionPage.locator(mode === "rules" ? '#rules-panel-cards [data-type="custom-skip-sound"]' : '#classic-behavior [data-type="custom-skip-sound"]')).toHaveCount(1);
    const status = block.locator(".custom-sound-status");
    const playButton = block.locator(".custom-sound-play");
    const fileInput = block.locator(".custom-sound-file-input");
    await expect(block).toBeHidden();

    await extensionPage.locator("label[for='audioNotificationOnSkip']").click();
    await expect(block).toBeVisible();
    const defaultStatus = await status.innerText();

    await fileInput.setInputFiles(path.join(__dirname, "../public/icons/beep.ogg"));
    await expect
        .poll(() =>
            readLocalStorage<{ dataUrl: string; name: string }>(extensionServiceWorker, "customSkipSound"))
        .toMatchObject({ dataUrl: expect.stringContaining("data:audio"), name: "beep.ogg" });
    await expect(status).toContainText("beep.ogg");
    await expect(status).not.toHaveText(defaultStatus);

    // 超过 10 秒的音效被拒绝，保留原选择
    let dialogMessage: string | null = null;
    extensionPage.once("dialog", (dialog) => {
        dialogMessage = dialog.message();
        dialog.accept();
    });
    await fileInput.setInputFiles({ name: "too-long.wav", mimeType: "audio/wav", buffer: buildWavBuffer(12) });
    await expect.poll(() => dialogMessage).toContain("10");
    await expect
        .poll(() => readLocalStorage(extensionServiceWorker, "customSkipSound"))
        .toMatchObject({ name: "beep.ogg" });

    // 试听中再次点击可停止
    await playButton.click();
    await expect(playButton).toHaveText(/停止|Stop/i);
    await playButton.click();
    await expect(playButton).toHaveText(/试听|Preview/i);

    // 音量滑杆与同步存储联动，刷新后保持
    const volumeBlock = extensionPage.locator("[data-type='skip-sound-volume']");
    const slider = volumeBlock.locator(".volume-slider");
    await expect(volumeBlock).toBeVisible();
    await slider.evaluate((element) => {
        (element as HTMLInputElement).value = "40";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expectSyncStorage(extensionServiceWorker, "skipSoundVolume", 0.4);
    await expect(volumeBlock.locator(".volume-value")).toHaveText(/40%/);
    const fade = extensionPage.locator('.fade-slider');
    await fade.fill('75');
    await expectSyncStorage(extensionServiceWorker, 'skipSoundFadeStart', 0.75);

    await extensionPage.reload();
    await expect(volumeBlock).toBeVisible();
    await expect(slider).toHaveValue("40");
    await expect(volumeBlock.locator(".volume-value")).toHaveText(/40%/);

    await expect(fade).toHaveValue('75');
    // A second settings window changes the same preferences and local audio selection.
    await writeSyncStorage(extensionServiceWorker, { skipSoundVolume: 0.6, skipSoundFadeStart: 0.5 });
    await expect(slider).toHaveValue('60');
    await expect(fade).toHaveValue('50');
    await extensionServiceWorker.evaluate(async () => { const { customSkipSound } = await chrome.storage.local.get('customSkipSound'); await chrome.storage.local.set({ customSkipSound: { ...customSkipSound, name: 'other-window.wav' } }); });
    await expect(status).toContainText('other-window.wav');
    // Moving between classic and rules keeps the original controls and their saved values.
    await toggleRuleEngine(extensionPage);
    if (mode === 'legacy') await extensionPage.locator('#rules-tab-cards').click();
    await expect(block).toBeVisible();
    await expect(block).toHaveCount(1);
    await expect(slider).toHaveValue('60');
    await expect(fade).toHaveValue('50');
    await block.locator(".custom-sound-reset").click();
    await expect.poll(() => readLocalStorage(extensionServiceWorker, "customSkipSound")).toBeFalsy();
    await expect(status).toHaveText(defaultStatus);
    await extensionPage.locator('label[for="audioNotificationOnSkip"]').click();
    await expect(block).toBeHidden();
    await expect(volumeBlock).toBeHidden();
    await expect(fade).toBeHidden();
});
}

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
    const draftAddress = `${permittedTestServerAddress}/draft`;
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
    extensionServiceWorker,
}) => {
    const address = permittedTestServerAddress;
    await writeSyncStorage(extensionServiceWorker, {
        serverAddress: address,
        mirrorServerAddresses: [],
    });
    await openOptions(extensionPage, extensionId, "#advanced");

    const primaryRow = extensionPage.locator("#primaryServerRow");
    const health = primaryRow.locator("#primaryServerHealth");
    let releaseReadyRequest: () => void;
    const readyRequestGate = new Promise<void>((resolve) => {
        releaseReadyRequest = resolve;
    });

    await expect(primaryRow).toHaveCSS("border-left-color", "rgb(82, 199, 122)");
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
    await expect(extensionPage.locator("#primaryServerRow")).toHaveCSS("animation-name", activeServerAnimationName);
    await expect(extensionPage.locator("#primaryServerRow")).toHaveCSS("animation-duration", "2.4s");
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
    const activeMirror = extensionPage.locator(".server-node-row").filter({ hasText: "https://www.bsbsb.xyz" });
    await expect(activeMirror).toHaveClass(/active/);
    await expect(activeMirror).toHaveCSS("animation-name", activeServerAnimationName);
});

test("uses a later mirror when earlier nodes fail a hash request", async ({
    extensionContext,
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await openOptions(extensionPage, extensionId, "#advanced");

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

test('persists independent rule-engine resume preferences', async ({ extensionId, extensionPage, extensionServiceWorker }) => {
    await openOptions(extensionPage, extensionId);
    await toggleRuleEngine(extensionPage);
    await expect(extensionPage.locator('[data-rule-setting="skipResumeAction"]')).toHaveValue('continue');
    await expect(extensionPage.locator('[data-rule-setting="speedUpResumeAction"]')).toHaveValue('continue');
    await extensionPage.locator('#rules-tab-matrix').click();
    await extensionPage.locator('[data-rule-setting="skipResumeAction"]').selectOption('manual');
    await extensionPage.locator('[data-rule-setting="speedUpResumeAction"]').selectOption('manual');
    await expectSyncStorage(extensionServiceWorker, 'skipResumeAction', 'manual');
    await expectSyncStorage(extensionServiceWorker, 'speedUpResumeAction', 'manual');
    await extensionPage.reload();
    await expect(extensionPage.locator('[data-rule-setting="skipResumeAction"]')).toHaveValue('manual');
    await expect(extensionPage.locator('[data-rule-setting="speedUpResumeAction"]')).toHaveValue('manual');
});
