import type { Page, Worker } from "@playwright/test";
import { expect, test } from "./fixtures/extension";
import { readSyncStorage, writeSyncStorage } from "./support/extensionStorage";

type RegexRule = { id: string; pattern: string; enabled: boolean; name?: string };

/** 正则词条设置位于“动态主页/评论区屏蔽”开关之下，需先启用才会显示 */
async function openBehaviorOptions(page: Page, extensionId: string, serviceWorker: Worker): Promise<void> {
    await writeSyncStorage(serviceWorker, { dynamicAndCommentSponsorBlocker: true });
    await page.goto(`chrome-extension://${extensionId}/options/options.html#behavior`);
    await expect(page.locator("#DynamicSponsorRegex tbody tr").first()).toBeVisible();
}

test("renders one toggleable row per built-in sponsor regex entry", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await openBehaviorOptions(extensionPage, extensionId, extensionServiceWorker);

    const rows = extensionPage.locator("#DynamicSponsorRegex tbody tr");
    await expect(rows).toHaveCount(10);
    await expect(extensionPage.locator("[data-rule-id='shoppingSite']")).toContainText("购物网站");
    await expect(extensionPage.locator("[data-rule-id='delivery']")).toContainText("外卖");
});

test("persists per-entry enabled state and the keyword threshold", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await openBehaviorOptions(extensionPage, extensionId, extensionServiceWorker);

    const deliveryToggle = extensionPage.locator("[data-rule-id='delivery'] input[type='checkbox']");
    await expect(deliveryToggle).toBeChecked();
    await deliveryToggle.uncheck();

    await expect
        .poll(async () => {
            const rules = await readSyncStorage<RegexRule[]>(extensionServiceWorker, "dynamicAndCommentSponsorRegexRules");
            return rules.find((rule) => rule.id === "delivery")?.enabled;
        })
        .toBe(false);

    const threshold = extensionPage.locator(
        "[data-sync='dynamicAndCommentSponsorRegexPatternKeywordNumber'] input[type='number']"
    );
    await threshold.fill("2");
    await expect
        .poll(() => readSyncStorage<string>(extensionServiceWorker, "dynamicAndCommentSponsorRegexPatternKeywordNumber"))
        .toBe("2");

    // 重新载入后 UI 与存储保持一致
    await extensionPage.reload();
    await expect(extensionPage.locator("[data-rule-id='delivery'] input[type='checkbox']")).not.toBeChecked();
    await expect(threshold).toHaveValue("2");
});

test("configures regex flags separately from the entries", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await openBehaviorOptions(extensionPage, extensionId, extensionServiceWorker);

    // 默认与旧版 /gi 一致
    await expect(extensionPage.locator("#sponsorRegexFlag_g")).toBeChecked();
    await expect(extensionPage.locator("#sponsorRegexFlag_i")).toBeChecked();
    await expect(extensionPage.locator("#sponsorRegexFlag_m")).not.toBeChecked();

    await extensionPage.locator("#sponsorRegexFlag_i").uncheck();
    await expect
        .poll(() => readSyncStorage<string>(extensionServiceWorker, "dynamicAndCommentSponsorRegexFlags"))
        .toBe("g");

    await extensionPage.locator("#sponsorRegexFlag_m").check();
    await expect
        .poll(() => readSyncStorage<string>(extensionServiceWorker, "dynamicAndCommentSponsorRegexFlags"))
        .toBe("gm");

    await extensionPage.reload();
    await expect(extensionPage.locator("#sponsorRegexFlag_i")).not.toBeChecked();
    await expect(extensionPage.locator("#sponsorRegexFlag_m")).toBeChecked();
});

test("adds and removes a custom entry", async ({ extensionId, extensionPage, extensionServiceWorker }) => {
    await openBehaviorOptions(extensionPage, extensionId, extensionServiceWorker);

    const rows = extensionPage.locator("#DynamicSponsorRegex tbody tr");
    await extensionPage.locator("#addSponsorRegexRule").click();
    await expect(rows).toHaveCount(11);

    const customRow = extensionPage.locator("#DynamicSponsorRegex tbody tr").last();
    await customRow.locator("[data-rule-name]").fill("我的推广词");
    await customRow.locator("[data-rule-pattern]").fill("某某产品");

    await expect
        .poll(async () => {
            const rules = await readSyncStorage<RegexRule[]>(extensionServiceWorker, "dynamicAndCommentSponsorRegexRules");
            const custom = rules.find((rule) => rule.id.startsWith("custom_"));
            return custom && { name: custom.name, pattern: custom.pattern };
        })
        .toEqual({ name: "我的推广词", pattern: "某某产品" });

    await extensionPage.on("dialog", (dialog) => dialog.accept());
    await customRow.locator(".option-button").click();
    await expect(rows).toHaveCount(10);
});

test("resets edited built-in entries back to the shipped defaults", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await openBehaviorOptions(extensionPage, extensionId, extensionServiceWorker);

    const patternInput = extensionPage.locator("[data-rule-id='shoppingSite'] [data-rule-pattern]");
    await expect(patternInput).toHaveValue("(?:淘宝|tb|京东|jd|狗东|拼多多|pdd|天猫|tmall)搜索");

    await patternInput.fill("被改坏的内容");
    await extensionPage.locator("[data-rule-id='shoppingSite'] .option-button").click();
    await expect(patternInput).toHaveValue("(?:淘宝|tb|京东|jd|狗东|拼多多|pdd|天猫|tmall)搜索");
});

test("migrates a customized legacy regex into one custom entry and moves its flags", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await writeSyncStorage(extensionServiceWorker, {
        dynamicAndCommentSponsorBlocker: true,
        dynamicAndCommentSponsorRegexPattern: "/我的广告词/gi",
    });
    await extensionPage.goto(`chrome-extension://${extensionId}/options/options.html#behavior`);
    await expect(extensionPage.locator("#DynamicSponsorRegex tbody tr").first()).toBeVisible();

    const rules = await readSyncStorage<RegexRule[]>(extensionServiceWorker, "dynamicAndCommentSponsorRegexRules");
    expect(rules.find((rule) => rule.id === "legacyCustom")).toMatchObject({
        pattern: "我的广告词",
        enabled: true,
    });
    expect(rules.filter((rule) => rule.id !== "legacyCustom").every((rule) => !rule.enabled)).toBe(true);
    expect(
        await readSyncStorage<string | undefined>(extensionServiceWorker, "dynamicAndCommentSponsorRegexPattern")
    ).toBeUndefined();
    expect(await readSyncStorage<string>(extensionServiceWorker, "dynamicAndCommentSponsorRegexFlags")).toBe("gi");

    // 旧正则保留为启用的自定义词条，且斜杠与 flags 已拆分到对应控件
    await expect(extensionPage.locator("[data-rule-id='legacyCustom']")).toBeVisible();
    await expect(extensionPage.locator("[data-rule-id='legacyCustom'] input[type='checkbox']")).toBeChecked();
    await expect(extensionPage.locator("[data-rule-id='legacyCustom'] [data-rule-pattern]")).toHaveValue("我的广告词");
    await expect(extensionPage.locator("#sponsorRegexFlag_i")).toBeChecked();
});
