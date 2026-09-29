import { expect, test } from "./fixtures/extension";

test("injects the page bridge once under CSP, including frames, but excludes live pages", async ({
    extensionContext,
    extensionPage,
}) => {
    const html = `<!doctype html><html><head><script nonce="bsb-test">
        window.__INITIAL_STATE__ = { bvid: "BV1JfLg6qEtf", cid: "123456" };
        window.bridgeReplies = [];
        window.addEventListener("message", (event) => {
            if (event.data?.type === "testBridgeResponse") window.bridgeReplies.push(event.data.data);
        });
        window.postMessage({
            source: "biliSponsorBlock", id: "test-bridge", type: "getBvID", responseType: "testBridgeResponse"
        }, "/");
    </script></head><body><div id="app"></div></body></html>`;
    await extensionContext.route("https://*.bilibili.com/e2e-bridge**", (route) => route.fulfill({
        contentType: "text/html",
        headers: { "Content-Security-Policy": "script-src 'nonce-bsb-test'; frame-src https://*.bilibili.com" },
        body: html,
    }));
    const readReplies = () => (window as unknown as { bridgeReplies: string[] }).bridgeReplies;
    const expected = ["BV1JfLg6qEtf+123456"];

    await extensionPage.goto("https://www.bilibili.com/e2e-bridge");
    await expect.poll(() => extensionPage.evaluate(readReplies)).toEqual(expected);
    await extensionPage.evaluate(() => {
        const frame = document.createElement("iframe");
        frame.src = "https://www.bilibili.com/e2e-bridge-frame";
        document.body.appendChild(frame);
    });
    await expect.poll(() => extensionPage.frames()
        .find((frame) => frame.url().endsWith("e2e-bridge-frame"))?.evaluate(readReplies)).toEqual(expected);

    await extensionPage.reload();
    await expect.poll(() => extensionPage.evaluate(readReplies)).toEqual(expected);

    await extensionPage.goto("https://live.bilibili.com/e2e-bridge");
    await extensionPage.waitForTimeout(500);
    expect(await extensionPage.evaluate(readReplies)).toEqual([]);
});
