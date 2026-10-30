import { expect, test } from "./fixtures/extension";
import { writeSyncStorage } from "./support/extensionStorage";
import type { ContributionStats } from "../src/contributions/model";
import path from "path";

test("@local-server calendar shows floating date details without reserving space", async ({
    extensionPage: page, extensionId, extensionServiceWorker: worker,
}) => {
    await writeSyncStorage(worker, { testingServer: true, darkMode: true });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(`chrome-extension://${extensionId}/contributions/index.html`);
    const panel = page.locator(".calendar-panel");
    await expect(panel).toHaveAttribute("aria-busy", "false");
    await expect(page.locator(".date-detail")).toHaveCount(0);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    const year = new Date(Date.now() + 28800000).getUTCFullYear();
    const data: ContributionStats = await page.evaluate(async (year) => {
        const { userID } = await chrome.storage.sync.get("userID");
        let user = userID;
        for (let i = 0; i < 5000; i++) {
            const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(user));
            user = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
        }
        const response = await chrome.runtime.sendMessage({ message: "sendRequest", type: "GET",
            endpoint: "/api/contributionStats", data: { publicUserID: user, year } });
        if (response.status !== 200) throw new Error("Local contribution backend unavailable");
        return JSON.parse(response.responseText);
    }, year);
    const unavailable = data.impact.find((point) => point.skips === null);
    const available = data.impact.find((point) => point.skips !== null);
    expect(unavailable).toBeTruthy();
    expect(available).toBeTruthy();
    const day = (date: string) => page.locator(`.day[aria-label^="${date}，"]`);
    const originalHeight = (await panel.boundingBox()).height;
    await day(unavailable.date).hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip.locator("strong")).toHaveText(unavailable.date);
    await expect(tooltip).toContainText("提交");
    await expect(tooltip).not.toContainText("收获");
    expect((await panel.boundingBox()).height).toBe(originalHeight);
    await day(available.date).hover();
    await expect(tooltip.locator("strong")).toHaveText(available.date);
    await expect(tooltip).toContainText("当天收获");
    await expect(day(available.date)).not.toHaveAttribute("title");
    await page.screenshot({ path: path.resolve("ignored/contributions/calendar-hover.png"), fullPage: true });
    await panel.getByRole("heading", { name: "提交日历" }).hover();
    await expect(tooltip).toHaveCount(0);

    await page.locator(".day.selected").focus();
    const selected = await tooltip.locator("strong").innerText();
    await page.keyboard.press("ArrowUp");
    await expect(tooltip.locator("strong")).not.toHaveText(selected);
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);

    const range = page.locator(".calendar-range");
    const summary = page.locator(".calendar-summary");
    const dateBox = await range.boundingBox();
    const countBox = await summary.boundingBox();
    expect(countBox.x).toBeGreaterThanOrEqual(dateBox.x + dateBox.width);
    expect(Math.abs(countBox.y - dateBox.y)).toBeLessThan(5);
    await page.getByRole("navigation", { name: "日历年份" }).getByRole("button", { name: "2025", exact: true }).click();
    await expect(range).toHaveText("2025年");
    await day("2025-12-31").hover();
    await expect(tooltip.locator("strong")).toHaveText("2025-12-31");
    await expect(tooltip).not.toContainText("收获");
    await page.screenshot({ path: path.resolve("ignored/contributions/calendar-year.png"), fullPage: true });

    for (const width of [1920, 1440, 1024, 768, 390]) {
        await page.setViewportSize({ width, height: 1100 });
        await day("2025-12-31").hover();
        const box = await tooltip.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        if (width >= 768) expect(await page.locator(".calendar-scroll").evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
});
