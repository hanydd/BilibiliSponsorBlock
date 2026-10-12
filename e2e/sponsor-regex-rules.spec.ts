import { readFileSync } from "node:fs";
import type { Page, Worker } from "@playwright/test";
import { expect, test } from "./fixtures/extension";
import { readLocalStorage, readSyncStorage, writeSyncStorage } from "./support/extensionStorage";

type RegexRule = { id: string; pattern: string; enabled: boolean; name?: string };
type RemoteRegexConfig = { rules: RegexRule[] };

/** 从随包配置生成默认规则的预期值，避免另存一份测试规则。 */
const shippedRegexRules = (
    JSON.parse(readFileSync("ota/sponsorRegex.json", "utf8")) as { data: { rules: { pattern: string }[] } }
).data.rules.map((rule) => rule.pattern);
const shippedRuleCount = shippedRegexRules.length;

/** 正则词条设置位于“动态主页/评论区屏蔽”开关之下，需先启用才会显示 */
async function openBehaviorOptions(page: Page, extensionId: string, serviceWorker: Worker): Promise<void> {
    await writeSyncStorage(serviceWorker, { dynamicAndCommentSponsorBlocker: true });
    await page.goto(`chrome-extension://${extensionId}/options/options.html#behavior`);
    await expect(page.locator("#DynamicSponsorRegex tbody tr").first()).toBeVisible();
}

/** 0.11.1 已发布的默认值，固定保留以验证历史配置迁移，不随当前规则更新。 */
const shippedLegacyDefaultRegex =
    "/(618|11(?!1).11|双(?:11|十一|12|十二)|女神节)|恰(?:个|了|到)?饭|金主|(?:评论区)?(?:领(?:取|张|到)?|抢|有|送|得)(?:我的)?(?:神|优惠|红包|折扣|福利|无门槛|隐藏|秘密|专属|(?:超)?大(?:额)?|额外)*(?:券|卷|劵|q(?:uan)?)?(?:后|到手|价|使用|下单)?|(?:优惠|(?:券|卷|劵)后|到手|促销|活动|神)价|(?:淘宝|tb|京东|jd|狗东|拼多多|pdd|天猫|tmall)搜索|(?:随(便|时)|任意)(?:退|退货|换货)|(?:免费|无偿)(?:换(?:个)?新|替换|更换)(?:商品|物品)?|(?:点(?:击)?|戳|来|我)评论区(?:置顶)?|(?:立即|蓝链|链接|🔗)(?:购买|下单)|(?:vx|wx|微信|软件)扫码(?:领)?(?:优惠|红包|券)?|(?:我的)?同款(?:[的]?(?:推荐|好物|商品|入手|购买|拥有|分享|安利)?)|满\\d+|大促|促销|折扣|特价|秒杀|广告|推广|低至|热卖|抢购|新品|豪礼|赠品/gi";

test("renders one toggleable row per built-in sponsor regex entry", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await openBehaviorOptions(extensionPage, extensionId, extensionServiceWorker);

    const rows = extensionPage.locator("#DynamicSponsorRegex tbody tr");
    await expect(rows).toHaveCount(shippedRuleCount);
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
            const userRules = await readSyncStorage<RegexRule[]>(
                extensionServiceWorker,
                "dynamicAndCommentSponsorRegexUserRules"
            );
            return userRules.find((rule) => rule.id === "delivery")?.enabled;
        })
        .toBe(false);

    const threshold = extensionPage.locator(
        "[data-sync='dynamicAndCommentSponsorRegexPatternKeywordNumber'] input[type='number']"
    );
    await threshold.fill("2");
    await expect
        .poll(() => readSyncStorage<string>(extensionServiceWorker, "dynamicAndCommentSponsorRegexPatternKeywordNumber"))
        .toBe("2");

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
    await expect(rows).toHaveCount(shippedRuleCount + 1);

    const customRow = extensionPage.locator("#DynamicSponsorRegex tbody tr").last();
    await customRow.locator("[data-rule-name]").fill("我的推广词");
    await customRow.locator("[data-rule-pattern]").fill("某某产品");

    await expect
        .poll(async () => {
            const userRules = await readSyncStorage<RegexRule[]>(
                extensionServiceWorker,
                "dynamicAndCommentSponsorRegexUserRules"
            );
            const custom = userRules.find((rule) => rule.id.startsWith("custom_"));
            return custom && { name: custom.name, pattern: custom.pattern };
        })
        .toEqual({ name: "我的推广词", pattern: "某某产品" });

    await extensionPage.on("dialog", (dialog) => dialog.accept());
    await customRow.locator(".option-button").click();
    await expect(rows).toHaveCount(shippedRuleCount);
});

test("edits a built-in entry, then resets it back to the default", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await openBehaviorOptions(extensionPage, extensionId, extensionServiceWorker);

    const builtinRow = extensionPage.locator("[data-rule-id='shoppingSite']");
    const patternInput = builtinRow.locator("[data-rule-pattern]");
    const readUserRule = async () =>
        (await readSyncStorage<RegexRule[]>(extensionServiceWorker, "dynamicAndCommentSponsorRegexUserRules"))?.find(
            (rule) => rule.id === "shoppingSite"
        );

    await expect(patternInput).toHaveValue("(?:淘宝|tb|京东|jd|狗东|拼多多|pdd|天猫|tmall)搜索");

    await patternInput.fill("被改坏的内容");
    await expect.poll(readUserRule).toMatchObject({ pattern: "被改坏的内容", enabled: true });

    await builtinRow.locator("input[type='checkbox']").uncheck();
    await expect.poll(readUserRule).toMatchObject({ pattern: "被改坏的内容", enabled: false });

    await builtinRow.locator(".option-button").click();
    await expect(patternInput).toHaveValue("(?:淘宝|tb|京东|jd|狗东|拼多多|pdd|天猫|tmall)搜索");
    await expect(builtinRow.locator("input[type='checkbox']")).toBeChecked();
    await expect.poll(readUserRule).toBeUndefined();
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

    const userRules = await readSyncStorage<RegexRule[]>(
        extensionServiceWorker,
        "dynamicAndCommentSponsorRegexUserRules"
    );
    expect(userRules).toHaveLength(1);
    expect(userRules[0]).toMatchObject({ id: "legacyCustom", pattern: "我的广告词", enabled: true });
    expect(
        await readSyncStorage<string | undefined>(extensionServiceWorker, "dynamicAndCommentSponsorRegexPattern")
    ).toBeUndefined();
    expect(await readSyncStorage<string>(extensionServiceWorker, "dynamicAndCommentSponsorRegexFlags")).toBe("gi");

    await expect(extensionPage.locator("[data-rule-id='legacyCustom']")).toBeVisible();
    await expect(extensionPage.locator("[data-rule-id='legacyCustom'] input[type='checkbox']")).toBeChecked();
    await expect(extensionPage.locator("[data-rule-id='legacyCustom'] [data-rule-pattern]")).toHaveValue("我的广告词");
    await expect(extensionPage.locator("[data-rule-id='legacyCustom']")).not.toContainText("—");
    await expect(extensionPage.locator("#sponsorRegexFlag_i")).toBeChecked();
});

test("migrates an unmodified legacy regex onto the built-in entries without writing user rules", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    const legacyDefault = `/${shippedRegexRules.join("|")}/gi`;
    await writeSyncStorage(extensionServiceWorker, {
        dynamicAndCommentSponsorBlocker: true,
        dynamicAndCommentSponsorRegexPattern: legacyDefault,
    });

    await extensionPage.goto(`chrome-extension://${extensionId}/options/options.html#behavior`);
    await expect(extensionPage.locator("#DynamicSponsorRegex tbody tr").first()).toBeVisible();

    await expect
        .poll(() => readSyncStorage(extensionServiceWorker, "dynamicAndCommentSponsorRegexPattern"))
        .toBeUndefined();
    expect(
        await readSyncStorage<RegexRule[]>(extensionServiceWorker, "dynamicAndCommentSponsorRegexUserRules")
    ).toBeUndefined();
    await expect(extensionPage.locator("#DynamicSponsorRegex tbody tr")).toHaveCount(shippedRuleCount);
    await expect(extensionPage.locator("[data-rule-id='shoppingSite'] input[type='checkbox']")).toBeChecked();
});

test("drops a default regex shipped by an older release instead of keeping it as a custom entry", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await writeSyncStorage(extensionServiceWorker, {
        dynamicAndCommentSponsorBlocker: true,
        dynamicAndCommentSponsorRegexPattern: shippedLegacyDefaultRegex,
    });

    await extensionPage.goto(`chrome-extension://${extensionId}/options/options.html#behavior`);
    await expect(extensionPage.locator("#DynamicSponsorRegex tbody tr").first()).toBeVisible();

    expect(
        await readSyncStorage<RegexRule[]>(extensionServiceWorker, "dynamicAndCommentSponsorRegexUserRules")
    ).toBeUndefined();
    await expect(extensionPage.locator("#DynamicSponsorRegex tbody tr")).toHaveCount(shippedRuleCount);
    await expect(extensionPage.locator("[data-rule-name]")).toHaveCount(0);
});

test("recognises a narrowed shipped default instead of duplicating it as a custom entry", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    // 删除历史默认分支后，剩余默认分支仍应被识别，避免生成重复的自定义规则。
    const narrowed = shippedLegacyDefaultRegex.replace("|广告", "");
    expect(narrowed).not.toBe(shippedLegacyDefaultRegex);

    await writeSyncStorage(extensionServiceWorker, {
        dynamicAndCommentSponsorBlocker: true,
        dynamicAndCommentSponsorRegexPattern: narrowed,
    });

    await extensionPage.goto(`chrome-extension://${extensionId}/options/options.html#behavior`);
    await expect(extensionPage.locator("#DynamicSponsorRegex tbody tr").first()).toBeVisible();

    expect(
        await readSyncStorage<RegexRule[]>(extensionServiceWorker, "dynamicAndCommentSponsorRegexUserRules")
    ).toBeUndefined();
    await expect(extensionPage.locator("[data-rule-name]")).toHaveCount(0);
    await expect(extensionPage.locator("#DynamicSponsorRegex tbody tr")).toHaveCount(shippedRuleCount);
    await expect(extensionPage.locator("[data-rule-id='misc'] input[type='checkbox']")).toBeChecked();
});

test("keeps only the user's own terms when a shipped default is extended", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await writeSyncStorage(extensionServiceWorker, {
        dynamicAndCommentSponsorBlocker: true,
        dynamicAndCommentSponsorRegexPattern: shippedLegacyDefaultRegex.replace(
            /\/gi$/,
            "|我的专属推广词/gi"
        ),
    });

    await extensionPage.goto(`chrome-extension://${extensionId}/options/options.html#behavior`);
    await expect(extensionPage.locator("#DynamicSponsorRegex tbody tr").first()).toBeVisible();

    const userRules = await readSyncStorage<RegexRule[]>(
        extensionServiceWorker,
        "dynamicAndCommentSponsorRegexUserRules"
    );
    expect(userRules).toHaveLength(1);
    expect(userRules[0]).toMatchObject({ id: "legacyCustom", pattern: "我的专属推广词", enabled: true });
    await expect(extensionPage.locator("#DynamicSponsorRegex tbody tr")).toHaveCount(shippedRuleCount + 1);
    await expect(extensionPage.locator("[data-rule-id='legacyCustom'] [data-rule-pattern]")).toHaveValue(
        "我的专属推广词"
    );
});

test("migrates a legacy regex with extra terms into one custom entry", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
}) => {
    await writeSyncStorage(extensionServiceWorker, {
        dynamicAndCommentSponsorBlocker: true,
        dynamicAndCommentSponsorRegexPattern: `/${shippedRegexRules.join("|")}|我的广告词/gi`,
    });

    await extensionPage.goto(`chrome-extension://${extensionId}/options/options.html#behavior`);
    await expect(extensionPage.locator("#DynamicSponsorRegex tbody tr").first()).toBeVisible();

    const userRules = await readSyncStorage<RegexRule[]>(
        extensionServiceWorker,
        "dynamicAndCommentSponsorRegexUserRules"
    );
    expect(userRules).toHaveLength(1);
    expect(userRules[0]).toMatchObject({ id: "legacyCustom", pattern: "我的广告词", enabled: true });
});

test("applies OTA regex config updates without shipping a new version", async ({
    extensionId,
    extensionPage,
    extensionServiceWorker,
    extensionContext,
}) => {
    await openBehaviorOptions(extensionPage, extensionId, extensionServiceWorker);

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
    // TODO: 将旧词条文件接口的路由桩更新为 /api/ota 聚合响应。
    await extensionContext.route("**/sponsorRegex.json", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(remoteConfig) })
    );

    await extensionPage.locator("#checkSponsorRegexUpdate").click();

    await expect
        .poll(async () => {
            const remote = await readLocalStorage<RemoteRegexConfig>(extensionServiceWorker, "sponsorRegexRemoteConfig");
            return remote?.rules.find((rule) => rule.id === "shoppingSite")?.version;
        })
        .toBe(2);
    await expect
        .poll(async () => {
            const remote = await readLocalStorage<RemoteRegexConfig>(extensionServiceWorker, "sponsorRegexRemoteConfig");
            return remote?.rules.find((rule) => rule.id === "otaDelivery")?.pattern;
        })
        .toBe("某团外卖|某了么");

    await expect(extensionPage.locator("#sponsorRegexConfigStatus")).toContainText("已应用在线更新");
    await expect(extensionPage.locator("[data-rule-id='otaDelivery']")).toBeVisible();
    await expect(extensionPage.locator("[data-rule-id='otaDelivery']")).toContainText("2026-10-08");

    await extensionPage.locator("#checkSponsorRegexUpdate").click();
    await expect(extensionPage.locator("#sponsorRegexConfigStatus")).toContainText("已是最新");

    const builtinRow = extensionPage.locator("[data-rule-id='shoppingSite']");
    const patternInput = builtinRow.locator("[data-rule-pattern]");
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

    await builtinRow.locator(".option-button").click();
    await expect(patternInput).toHaveValue("在线新模式");
});
