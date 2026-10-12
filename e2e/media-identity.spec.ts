import { expect, test } from "./fixtures/extension";
import { defaultMockBvid, defaultMockCid, routeMockBilibiliVideoPage } from "./support/bilibiliPage";
import { waitForBilibiliContentScript } from "./support/submissionNotice";

test("reconciles a reused video's identity when metadata follows an early navigation signal", async ({
    extensionPage: page, sendContentMessage,
}) => {
    await routeMockBilibiliVideoPage(page);
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);
    await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(1);
    await page.evaluate(({ bvid, cid }) => {
        const pageWindow = window as unknown as {
            __INITIAL_STATE__?: unknown;
            player: { getManifest: () => { bvid: string; cid: string; p: number } };
        };
        delete pageWindow.__INITIAL_STATE__;
        pageWindow.player.getManifest = () => ({ bvid, cid, p: 1 });
        history.pushState(null, "", "?p=2");
    }, { bvid: defaultMockBvid, cid: defaultMockCid });
    expect((await sendContentMessage<{ videoID: string }>({ message: "getVideoID" })).videoID)
        .toBe(`${defaultMockBvid}+${defaultMockCid}`);
    await page.evaluate((bvid) => {
        const pageWindow = window as unknown as {
            player: { getManifest: () => { bvid: string; cid: string; p: number } };
        };
        pageWindow.player.getManifest = () => ({ bvid, cid: "654321", p: 2 });
        document.querySelector("video").dispatchEvent(new Event("loadedmetadata"));
    }, defaultMockBvid);
    await expect.poll(async () => (await sendContentMessage<{ videoID: string }>({ message: "getVideoID" })).videoID)
        .toBe(`${defaultMockBvid}+654321`);
    await expect(page.locator("#bsbPlayerButtonContainer")).toHaveCount(1);
});
