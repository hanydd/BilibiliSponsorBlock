/** @jest-environment jsdom */

describe("video match context", () => {
    beforeEach(() => {
        document.head.innerHTML = '<meta name="description" content="DOM description">';
        document.body.innerHTML = '<h1 class="video-title">DOM title</h1><a class="up-name">DOM UP</a>';
        window.__INITIAL_STATE__ = undefined;
    });

    test("prefers video metadata and uploader data from INITIAL_STATE", async () => {
        window.__INITIAL_STATE__ = {
            bvid: "BV1test" as never,
            toBvid: "BV1test" as never,
            aid: "1" as never,
            cid: "2" as never,
            upData: { mid: "123456789012345678", name: "State UP" },
            videoData: {
                title: "State title",
                desc: "State description",
            } as never,
            videoInfo: {} as never,
        };

        const { readPageVideoMatchContext } = await import("../src/utils/injectedScriptMessageUtils");

        expect(readPageVideoMatchContext()).toEqual({
            bvid: "BV1test",
            title: "State title",
            description: "State description",
            up_mid: "123456789012345678",
            up_name: "State UP",
        });
    });

    test("falls back to rendered DOM metadata", async () => {
        const { readPageVideoMatchContext } = await import("../src/utils/injectedScriptMessageUtils");

        expect(readPageVideoMatchContext()).toEqual({
            bvid: "",
            title: "DOM title",
            description: "DOM description",
            up_mid: "",
            up_name: "DOM UP",
        });
    });
});
