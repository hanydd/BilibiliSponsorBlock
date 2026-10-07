import type { Page, Worker } from "@playwright/test";
import { expect, test } from "./fixtures/extension";
import { readLocalStorage, readSyncStorage, writeSyncStorage } from "./support/extensionStorage";

type RegexRule = { id: string; pattern: string; enabled: boolean; name?: string };
type RemoteRegexConfig = { rules: RegexRule[] };

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
    // 测试浏览器 UI 语言为 en-US，词条名取自配置文件自带的 locales.en
    await expect(extensionPage.locator("[data-rule-id='shoppingSite']")).toContainText("Shopping Sites");
    await expect(extensionPage.locator("[data-rule-id='delivery']")).toContainText("Food Delivery");
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

test("applies OTA regex config updates without shipping a new version", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
    extensionContext,
}) => {
    await openBehaviorOptions(extensionPage, extensionId, extensionServiceWorker);

    // 在线配置：shoppingSite 升版本，新增一个词条；本地路由直接模拟 CDN 返回
    let remoteConfig: RemoteRegexConfig = {
        rules: [
            {
                id: "shoppingSite",
                locales: { en: "Shopping Sites", zh_CN: "购物网站", zh_TW: "購物網站" },
                pattern: "(?:淘宝|京东)搜索",
                enabled: true,
                version: 2,
                updateAt: { year: 2026, month: 10, day: 8 },
            },
            {
                id: "otaDelivery",
                locales: { en: "OTA Delivery", zh_CN: "在线外卖", zh_TW: "線上外送" },
                pattern: "某团外卖|某了么",
                enabled: true,
                version: 1,
                updateAt: { year: 2026, month: 10, day: 8 },
            },
        ],
    };
    await extensionContext.route("**/sponsorRegex.json", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(remoteConfig) })
    );

    await extensionPage.locator("#checkSponsorRegexUpdate").click();

    // 在线版本已应用，新增词条进入词条列表，且来源状态切换为在线配置
    await expect
        .poll(async () => {
            const remote = await readLocalStorage<RemoteRegexConfig>(extensionServiceWorker, "sponsorRegexRemoteConfig");
            return remote?.rules.find((rule) => rule.id === "shoppingSite")?.version;
        })
        .toBe(2);
    await expect
        .poll(async () => {
            const rules = await readSyncStorage<RegexRule[]>(extensionServiceWorker, "dynamicAndCommentSponsorRegexRules");
            return rules.find((rule) => rule.id === "otaDelivery")?.pattern;
        })
        .toBe("某团外卖|某了么");

    await expect(extensionPage.locator("#sponsorRegexConfigStatus")).toContainText("已应用在线更新");
    await expect(extensionPage.locator("[data-rule-id='otaDelivery']")).toBeVisible();
    // 词条行展示自己的更新日期
    await expect(extensionPage.locator("[data-rule-id='otaDelivery']")).toContainText("2026-10-08");

    // 再次检查视为已是最新，不重复改写
    await extensionPage.locator("#checkSponsorRegexUpdate").click();
    await expect(extensionPage.locator("#sponsorRegexConfigStatus")).toContainText("已是最新");

    // 用户修改过的词条在更高版本的在线更新中不被覆盖
    const patternInput = extensionPage.locator("[data-rule-id='shoppingSite'] [data-rule-pattern]");
    await patternInput.fill("用户自定义搜索");
    remoteConfig = {
        rules: [
            {
                id: "shoppingSite",
                locales: { en: "Shopping Sites", zh_CN: "购物网站", zh_TW: "購物網站" },
                pattern: "在线新模式",
                enabled: true,
                version: 3,
                updateAt: { year: 2026, month: 10, day: 9 },
            },
            {
                id: "otaDelivery",
                locales: { en: "OTA Delivery", zh_CN: "在线外卖", zh_TW: "線上外送" },
                pattern: "某团外卖|某了么",
                enabled: true,
                version: 1,
                updateAt: { year: 2026, month: 10, day: 8 },
            },
        ],
    };
    await extensionPage.locator("#checkSponsorRegexUpdate").click();
    await expect
        .poll(async () => {
            const remote = await readLocalStorage<RemoteRegexConfig>(extensionServiceWorker, "sponsorRegexRemoteConfig");
            return remote?.rules.find((rule) => rule.id === "shoppingSite")?.version;
        })
        .toBe(3);
    await expect(patternInput).toHaveValue("用户自定义搜索");
});
