import { expect, test } from "./fixtures/extension";
import { writeSyncStorage } from "./support/extensionStorage";
import path from "path";

test("@local-server contribution page uses real backend without new permissions", async ({
    extensionPage: page,
    extensionId,
    extensionServiceWorker: worker,
    extensionContext: context,
}) => {
    await writeSyncStorage(worker, {
        testingServer: true,
        darkMode: false,
        userID: "00000000-0000-4000-8000-000000000001",
    });
    await page.goto(`chrome-extension://${extensionId}/contributions/index.html`);
    await expect(page.getByRole("heading", { name: "提交日历", exact: true })).toBeVisible();
    await expect(page.getByText("TIME · 本地演示", { exact: false })).toBeVisible();
    await expect(page.locator(".day:not(:disabled)")).not.toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await writeSyncStorage(worker, { darkMode: true });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await writeSyncStorage(worker, { darkMode: false });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({ path: path.resolve("ignored/contributions/contributions-overview.png"), fullPage: true });
    await page.locator(".day.selected").focus();
    const initial = await page.locator(".date-detail strong").innerText();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(".date-detail strong")).not.toHaveText(initial);
    await page.getByRole("button", { name: "近 7 天", exact: true }).click();
    await expect(page.getByRole("button", { name: "近 7 天", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "节省时长", exact: true }).click();
    await expect(page.getByRole("group", { name: "每日节省时长曲线" })).toBeVisible();
    const ranks = page.getByRole("table", { name: "近7日片段排行" }).locator("tbody tr");
    await expect(ranks).toHaveCount(10);
    await expect(ranks.first().locator("a")).toHaveAttribute("href", /\?p=3&t=/);
    const bySkips = await ranks.first().locator(".segment-info").textContent();
    await page.getByLabel("片段排行排序").selectOption("bySavedMs");
    await expect(ranks).toHaveCount(10);
    await expect(ranks.first().locator(".segment-info")).not.toHaveText(bySkips);
    await page.getByLabel("片段排行排序").selectOption("bySkips");
    await expect(ranks.first().locator(".segment-info")).toHaveText(bySkips);
    const days = await page
        .getByLabel("分类统计日期")
        .locator("option")
        .evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
    await page.getByLabel("分类统计日期").selectOption(days[2]);
    await expect(page.locator(".category")).toHaveCount(3);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({ path: path.resolve("ignored/contributions/contributions-light.png"), fullPage: true });
    await page.locator(".segment-ranking").screenshot({ path: path.resolve("ignored/contributions/segment-ranking.png") });
    await page.getByLabel("外观", { exact: true }).selectOption("dark");
    await page.screenshot({ path: path.resolve("ignored/contributions/contributions-dark.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.resolve("ignored/contributions/contributions-mobile.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const todayCount = await page.locator(".summary-card").first().locator("strong").innerText();
    await page.getByLabel("日历年份").selectOption("2025");
    await expect(page.locator(".heatmap")).toHaveAttribute("aria-label", /2025/);
    await expect(page.locator(".summary-card").first().locator("strong")).toHaveText(todayCount);
    // Existing openPage handler must open the packaged page from the popup.
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const opened = context.waitForEvent("page");
    await popup.getByRole("button", { name: "贡献日历 ↗" }).click();
    const dashboard = await opened;
    await dashboard.waitForURL("**/contributions/index.html");
    await dashboard.close();
    await popup.close();
    await writeSyncStorage(worker, { userID: "local-contribution-empty-user" });
    await expect(page.locator(".calendar-summary strong")).toContainText("0");
    await expect(page.locator(".empty-detail")).toContainText("暂无跳过记录");
    await expect(page.locator(".ranking-empty")).toContainText("暂无可展示");
    await page.screenshot({ path: path.resolve("ignored/contributions/contributions-empty.png"), fullPage: true });
    await context.setOffline(true);
    await page.getByRole("button", { name: "刷新数据" }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 25000 });
    await page.screenshot({ path: path.resolve("ignored/contributions/contributions-error.png"), fullPage: true });
    await context.setOffline(false);
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByRole("heading", { name: "提交日历", exact: true })).toBeVisible();
    const permissions = await worker.evaluate(() => chrome.runtime.getManifest().permissions);
    expect(permissions).toEqual(["storage", "scripting"]);
});
