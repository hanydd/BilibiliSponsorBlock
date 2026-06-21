/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://www.bilibili.com/video/BV1xx411c7mD/"}
 */

import { PageType } from "../src/types";

describe("video page type state", () => {
    let parsedVideoID: string | null;
    let parseVideoIDFromUrl: boolean;

    beforeEach(() => {
        jest.resetModules();
        window.history.replaceState(null, "", "https://www.bilibili.com/video/BV1xx411c7mD/");
        parsedVideoID = "BV1xx411c7mD+12345";
        parseVideoIDFromUrl = false;

        (global as unknown as { chrome: typeof chrome }).chrome = {
            runtime: {
                getManifest: jest.fn(() => ({ manifest_version: 3 })),
                id: "test-extension",
            },
        } as unknown as typeof chrome;

        jest.doMock("../dist/js/document.js", () => ({}));
        jest.doMock("../src/config", () => ({
            __esModule: true,
            default: {
                isReady: jest.fn(() => true),
                local: {},
                forceLocalUpdate: jest.fn(),
            },
        }));
        jest.doMock("../src/utils/parseVideoID", () => ({
            getBilibiliVideoID: jest.fn(async (url?: string) => {
                if (!parseVideoIDFromUrl) return parsedVideoID;

                const targetUrl = url ?? document.URL;
                return targetUrl.includes("/video/") ? "BV1xx411c7mD+12345" : null;
            }),
        }));
        jest.doMock("../src/utils/injectedScriptMessageUtils", () => ({
            getPropertyFromWindow: jest.fn(async ({ sendType }) => sendType === "getFrameRate" ? 30 : "123"),
        }));
        jest.doMock("../src/thumbnail-utils/thumbnailManagement", () => ({
            checkPageForNewThumbnails: jest.fn(),
        }));
        jest.doMock("../src/utils/dom", () => ({
            getElement: jest.fn(() => null),
            isVisible: jest.fn(() => false),
            waitForElement: jest.fn(() => new Promise(() => undefined)),
        }));
    });

    test("keeps video page type after a video ID change", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { checkVideoIDChange, detectPageType, getPageType } = await import("../src/utils/video");

        createContentApp();

        expect(detectPageType()).toBe(PageType.Video);

        await checkVideoIDChange();

        expect(getPageType()).toBe(PageType.Video);
    });

    test("keeps video context when video ID parsing temporarily fails on a video page", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { checkVideoIDChange, getPageType, getVideoID } = await import("../src/utils/video");

        createContentApp();

        await checkVideoIDChange();
        parsedVideoID = null;

        await checkVideoIDChange();

        expect(getPageType()).toBe(PageType.Video);
        expect(getVideoID()).toBe("BV1xx411c7mD+12345");
    });

    test("clears video context when routing away from a video page", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { checkVideoIDChange, getPageType, getVideoID } = await import("../src/utils/video");

        parseVideoIDFromUrl = true;
        createContentApp();

        await checkVideoIDChange();
        window.history.pushState(null, "", "https://www.bilibili.com/");

        await checkVideoIDChange();

        expect(getPageType()).toBe(PageType.Main);
        expect(getVideoID()).toBeNull();
    });
});
