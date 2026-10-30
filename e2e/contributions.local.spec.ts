import { expect, test } from "./fixtures/extension";
import { writeSyncStorage, writeLocalStorage, readLocalStorage } from "./support/extensionStorage";
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
    // Delay delivery of the real backend response, without replacing its data.
    await page.addInitScript(() => {
        const delivery = { hold: true, release: null as null | (() => void), calendar: null as Element | null };
        (window as any).__contributionDelivery = delivery;
        const send = chrome.runtime.sendMessage.bind(chrome.runtime);
        chrome.runtime.sendMessage = ((message: any, callback: any) => {
            if (message?.endpoint === "/api/contributionStats" && delivery.hold) {
                send(message, (response) => { delivery.release = () => callback(response); });
            } else send(message, callback);
        }) as typeof chrome.runtime.sendMessage;
    });
    await page.goto(`chrome-extension://${extensionId}/contributions/index.html`);
    await expect(page.locator(".loading-dashboard")).toBeVisible();
    await expect(page.getByRole("heading", { name: "每日收获", exact: true })).toBeVisible();
    await page.screenshot({ path: path.resolve("ignored/contributions/contributions-loading.png"), fullPage: true });
    await page.waitForFunction(() => typeof (window as any).__contributionDelivery.release === "function");
    await page.evaluate(() => { const d = (window as any).__contributionDelivery; d.hold = false; d.release(); });
    await expect(page.getByRole("heading", { name: "提交日历", exact: true })).toBeVisible();
    await expect(page.locator(".intro p")).toBeVisible();
    await expect(page.locator(".day:not(:disabled)")).not.toHaveCount(0);
    const beijingToday = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    await expect(page.getByRole("navigation", { name: "日历年份" }).getByRole("button", { name: beijingToday.slice(0, 4), exact: true })).toHaveAttribute("aria-pressed", "true");
    const years = page.getByRole("navigation", { name: "日历年份" });
    const yearLabels = await years.getByRole("button").allTextContents();
    expect(yearLabels.at(-1)).toBe("2024");
    expect(yearLabels).not.toContain("2023");
    await expect(page.locator(".day")).toHaveCount(365);
    await expect(page.locator(".day").last()).toHaveAttribute("aria-label", new RegExp(beijingToday));
    await expect(page.locator(".day:disabled")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await writeSyncStorage(worker, { darkMode: true });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await writeSyncStorage(worker, { darkMode: false });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    for (const width of [1920, 1440, 1280, 1024, 900, 768]) {
        await page.setViewportSize({ width, height: 1100 });
        expect(await page.locator(".calendar-scroll").evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        expect(await page.locator(".month-row span").evaluateAll((labels) => new Set(labels.map((el) => Math.round(el.getBoundingClientRect().top))).size)).toBe(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({ path: path.resolve("ignored/contributions/contributions-overview.png"), fullPage: true });
    await page.locator(".day.selected").focus();
    const initial = await page.locator(".calendar-tooltip strong").innerText();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(".calendar-tooltip strong")).not.toHaveText(initial);
    const calendarBefore = await page.locator(".heatmap").boundingBox();
    const selectedBefore = await page.locator(".day.selected").getAttribute("aria-label");
    await page.evaluate(() => { const d = (window as any).__contributionDelivery; d.hold = true; d.release = null; d.calendar = document.querySelector(".heatmap"); });
    await page.getByRole("button", { name: "刷新数据", exact: true }).click();
    await expect(page.locator(".dashboard")).toHaveAttribute("aria-busy", "true");
    expect(await page.locator(".heatmap").boundingBox()).toEqual(calendarBefore);
    expect(await page.evaluate(() => (window as any).__contributionDelivery.calendar === document.querySelector(".heatmap"))).toBe(true);
    await page.screenshot({ path: path.resolve("ignored/contributions/contributions-refreshing.png"), fullPage: true });
    await page.waitForFunction(() => typeof (window as any).__contributionDelivery.release === "function");
    await page.evaluate(() => { const d = (window as any).__contributionDelivery; d.hold = false; d.release(); });
    await expect(page.locator(".dashboard")).toHaveAttribute("aria-busy", "false");
    await expect(page.locator(".day.selected")).toHaveAttribute("aria-label", selectedBefore);
    await page.getByRole("button", { name: "近 7 天", exact: true }).click();
    await expect(page.getByRole("button", { name: "近 7 天", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("group", { name: "每日跳过次数与节省时长曲线" })).toBeVisible();
    await expect(page.locator(".trend-line.series-skips")).not.toHaveCount(0);
    await expect(page.locator(".trend-line.series-savedMs")).not.toHaveCount(0);
    const ranks = page.getByRole("table", { name: "近7日片段排行" }).locator("tbody tr");
    await expect(ranks).toHaveCount(10);
    await expect(ranks.first().locator("a")).toHaveAttribute("href", /\?p=3&t=/);
    const bySkips = await ranks.first().locator(".segment-info").textContent();
    await page.getByLabel("片段排行排序").selectOption("bySavedMs");
    await expect(ranks).toHaveCount(10);
    await expect(ranks.first().locator(".segment-info")).not.toHaveText(bySkips);
    await page.getByLabel("片段排行排序").selectOption("bySkips");
    await expect(ranks.first().locator(".segment-info")).toHaveText(bySkips);
    const community = page.getByRole("region", { name: "社区今日贡献" });
    await expect(community).toBeVisible();
    await expect(community.locator(".community-total strong")).not.toBeEmpty();
    await expect(community.locator(".community-ranking li")).toHaveCount(5);
    await expect(community.getByRole("link", { name: "支持项目 ↗" })).toHaveAttribute("href", "https://bsbsb.top/donate/");
    await page.getByLabel("社区榜单").selectOption("submissions");
    await expect(community.getByRole("list", { name: "今日贡献榜" })).toBeVisible();
    await expect(community.locator(".community-value strong").first()).toContainText("片段");
    await community.screenshot({ path: path.resolve("ignored/contributions/community-submissions.png") });
    await page.getByLabel("社区榜单").selectOption("segments");
    await expect(community.getByRole("list", { name: "今日片段跳过榜" }).locator("li")).toHaveCount(10);
    await expect(community.locator(".community-segment-info a").first()).toHaveAttribute("href", /bilibili\.com\/video\//);
    await page.getByLabel("社区榜单").selectOption("saved");
    await community.screenshot({ path: path.resolve("ignored/contributions/community-saved.png") });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({ path: path.resolve("ignored/contributions/contributions-light.png"), fullPage: true });
    await page.locator(".details-grid").screenshot({ path: path.resolve("ignored/contributions/contributions-details.png") });
    await page.locator(".segment-ranking").screenshot({ path: path.resolve("ignored/contributions/segment-ranking.png") });
    await expect(page.getByLabel("外观", { exact: true })).toHaveCount(0);
    await writeSyncStorage(worker, { darkMode: true });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({ path: path.resolve("ignored/contributions/contributions-dark.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.resolve("ignored/contributions/contributions-mobile.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const todayCount = await page.locator(".summary-card").first().locator("strong").innerText();
    await page.evaluate(() => { const d = (window as any).__contributionDelivery; d.hold = true; d.release = null; });
    await years.getByRole("button", { name: "2025", exact: true }).click();
    await expect(page.locator(".calendar-panel")).toHaveAttribute("aria-busy", "true");
    expect(await page.locator(".calendar-panel .day").evaluateAll((cells) => new Set(cells.map((el) => getComputedStyle(el).backgroundColor)).size)).toBe(1);
    await expect(page.locator(".calendar-panel").getByText(/正在加载/)).toHaveCount(0);
    await page.locator(".calendar-panel").screenshot({ path: path.resolve("ignored/contributions/calendar-loading-grey.png") });
    await expect(page.locator(".dashboard")).toHaveAttribute("aria-busy", "false");
    await expect(page.locator(".summary-card").first().locator("strong")).toHaveText(todayCount);
    await page.getByRole("button", { name: "近 90 天", exact: true }).click();
    await expect(page.getByRole("button", { name: "近 90 天", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(years.getByRole("button", { name: "2024", exact: true })).toBeEnabled();
    await page.waitForFunction(() => typeof (window as any).__contributionDelivery.release === "function");
    await page.evaluate(() => { const d = (window as any).__contributionDelivery; d.hold = false; d.release(); });
    await expect(page.locator(".calendar-panel")).toHaveAttribute("aria-busy", "false");
    await expect(page.locator(".heatmap")).toHaveAttribute("aria-label", /2025-01-01 至 2025-12-31/);
    await expect(page.locator(".calendar-range")).toHaveText("2025年");
    await expect(page.locator(".summary-card").first().locator("strong")).toHaveText(todayCount);
    await years.getByRole("button", { name: "2024", exact: true }).click();
    await expect(page.locator(".heatmap")).toHaveAttribute("aria-label", /2024-01-01 至 2024-12-31/);
    await expect(page.locator(".day")).toHaveCount(366);
    await years.getByRole("button", { name: beijingToday.slice(0, 4), exact: true }).click();
    await expect(page.locator(".calendar-panel")).toHaveAttribute("aria-busy", "false");
    await expect(page.locator(".day").last()).toHaveAttribute("aria-label", new RegExp(beijingToday));
    expect(await page.locator(".calendar-scroll").evaluate((el) => Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft))).toBeLessThanOrEqual(1);
    // Existing openPage handler must open the packaged page from the popup.
    await writeLocalStorage(worker, { contributionCalendarNewDismissed: false });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const entry = popup.getByRole("button", { name: "贡献日历", exact: true });
    await expect(entry).toBeVisible();
    await expect(popup.locator("#usernameValue")).toContainText("TIME");
    await expect(popup.locator("#sponsorTimesContributionsContainer .sbContributionCalendar")).toBeVisible();
    const card = await popup.locator(".sbYourWorkBox").boundingBox();
    const columns = await popup.locator(".sbYourWorkCols").boundingBox();
    expect(Math.abs(columns.width - (card.width - 4))).toBeLessThan(1);
    expect(await popup.locator(".sbYourWorkBox").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await popup.locator(".sbYourWorkBox").screenshot({ path: path.resolve("ignored/contributions/popup-calendar-entry.png") });
    const headingWidth = (await popup.locator(".sbContributionHeading").boundingBox()).width;
    const pageCount = context.pages().length;
    await popup.getByRole("button", { name: "不再显示贡献日历的新功能提示" }).click();
    await expect(popup.locator(".sbContributionNew")).toHaveCount(0);
    expect(context.pages().length).toBe(pageCount);
    expect((await popup.locator(".sbContributionHeading").boundingBox()).width).toBe(headingWidth);
    await expect.poll(() => readLocalStorage(worker, "contributionCalendarNewDismissed")).toBe(true);
    await popup.reload();
    await expect(entry).toBeVisible();
    await expect(popup.locator("#usernameValue")).toContainText("TIME");
    await expect(popup.locator(".sbContributionNew")).toHaveCount(0);
    await popup.locator(".sbYourWorkBox").screenshot({ path: path.resolve("ignored/contributions/popup-calendar-dismissed.png") });
    // A short name must stay at the left edge, with actions immediately after it.
    await popup.locator("#usernameValue").evaluate((el) => { el.textContent = "hanyd"; });
    const nameBox = await popup.locator("#usernameValue").boundingBox();
    const labelBox = await popup.locator("#usernameElement > p").boundingBox();
    const editBox = await popup.locator("#setUsernameButton").boundingBox();
    expect(nameBox.x).toBe(labelBox.x);
    expect(editBox.x - nameBox.x - nameBox.width).toBeLessThanOrEqual(9);
    expect(await popup.locator("#usernameValue").evaluate((el) => getComputedStyle(el).textAlign)).toBe("left");
    await popup.locator(".sbYourWorkBox").screenshot({ path: path.resolve("ignored/contributions/popup-short-name.png") });
    const opened = context.waitForEvent("page");
    await entry.click();
    const dashboard = await opened;
    await dashboard.waitForURL("**/contributions/index.html");
    await dashboard.close();
    await popup.close();
    await writeSyncStorage(worker, { userID: "local-contribution-empty-user" });
    await expect(page.locator(".calendar-summary strong")).toContainText("0");
    await expect(page.locator(".community-total strong")).not.toBeEmpty();
    await expect(page.locator(".ranking-empty")).toContainText("暂无可展示");
    await page.screenshot({ path: path.resolve("ignored/contributions/contributions-empty.png"), fullPage: true });
    await context.setOffline(true);
    await page.getByRole("button", { name: "刷新数据" }).click();
    await expect(page.locator(".load-feedback [role=alert]")).toBeVisible({ timeout: 25000 });
    await expect(page.locator(".dashboard")).toBeVisible();
    await expect(page.locator(".loading-dashboard")).toHaveCount(0);
    await page.screenshot({ path: path.resolve("ignored/contributions/contributions-error.png"), fullPage: true });
    await expect(community.locator(".community-total strong")).not.toBeEmpty();
    await expect(community.getByRole("alert")).toBeVisible({ timeout: 25000 });
    await context.setOffline(false);
    await community.getByRole("button", { name: "重试", exact: true }).click();
    await expect(community.getByRole("alert")).toHaveCount(0);
    await expect(community).toHaveAttribute("aria-busy", "false");
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByRole("heading", { name: "提交日历", exact: true })).toBeVisible();
    const permissions = await worker.evaluate(() => chrome.runtime.getManifest().permissions);
    expect(permissions).toEqual(["storage", "scripting"]);
});
