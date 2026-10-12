import { expect, test } from "./fixtures/extension";
import { writeSyncStorage } from "./support/extensionStorage";
import { openRealBilibiliPage } from "./support/realBilibili";
import { waitForBilibiliContentScript } from "./support/submissionNotice";

test("@real retains description binding when the same player becomes ready again", async ({
    extensionPage: page, extensionContext, extensionServiceWorker, sendContentMessage,
}, testInfo) => {
    testInfo.setTimeout(120_000);
    await writeSyncStorage(extensionServiceWorker, { showPortVideoButton: true, autoHideInfoButton: false });
    let lookups = 0;
    await extensionContext.route("https://www.bsbsb.top/api/portVideo/**", async route => {
        lookups++;
        const manifest = await page.evaluate(() => (window as unknown as {
            player: { getManifest(): { bvid: string; cid: string } };
        }).player.getManifest());
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
            bvID: manifest.bvid, cid: String(manifest.cid), ytbID: "dQw4w9WgXcQ", UUID: "e2e-binding", votes: 0, locked: false,
        }]) });
    });
    await openRealBilibiliPage(page, testInfo, "https://www.bilibili.com/video/BV1JfLg6qEtf/");
    await waitForBilibiliContentScript(page, sendContentMessage);
    await expect(page.locator("#bsbPortButton svg > path").first()).toHaveAttribute("fill", "#c76b6b");
    await page.locator("#bsbPortButton button").click();
    await expect(page.locator("#ytbLink")).toHaveText("dQw4w9WgXcQ");
    const root = await page.locator("#bsbDescriptionContainer").elementHandle();
    const readyCount = async () => {
        const response = await sendContentMessage<{ logs: { lifecycle: { stage: string }[] } }>({ message: "getLogs" });
        return response.logs.lifecycle.filter(entry => entry.stage === "playerUI/ready").length;
    };
    const before = await readyCount();
    // Exercise the same readiness loss/recovery without Playwright's forced
    // page focus masking native visibility events in the default test runner.
    const controls = page.locator(".bpx-player-control-bottom-right");
    const display = await controls.evaluate((node: HTMLElement) => {
        const display = node.style.display;
        node.style.display = "none";
        return display;
    });
    await page.waitForTimeout(300);
    await controls.evaluate((node: HTMLElement, display) => { node.style.display = display; }, display);
    await expect.poll(readyCount).toBeGreaterThan(before);
    expect(await root.evaluate(node => node.isConnected)).toBe(true);
    await expect(page.locator("#ytbLink")).toHaveText("dQw4w9WgXcQ");
    await expect(page.locator("#bsbDescriptionContainer")).toHaveCount(1);
    expect(lookups).toBe(1);
});
