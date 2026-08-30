/** @jest-environment jsdom */

import type { SegmentUUID, SponsorTime } from "../src/types";

describe("content message handler", () => {
    function installModuleMocks(): void {
        jest.doMock("../src/config", () => ({
            __esModule: true,
            default: {
                configSyncListeners: [],
            },
        }));
        jest.doMock("../src/utils/video", () => ({
            checkVideoIDChange: jest.fn(),
            getChannelIDInfo: jest.fn(() => ({ id: null, status: 0 })),
            getVideo: jest.fn(() => ({ currentTime: 0, duration: 100 })),
            getVideoID: jest.fn(() => "BV1test"),
        }));
        jest.doMock("../src/utils/parseVideoID", () => ({
            getBilibiliVideoID: jest.fn(async () => "BV1test"),
        }));
        jest.doMock("../src/thumbnail-utils/thumbnailManagement", () => ({
            checkPageForNewThumbnails: jest.fn(),
        }));
        jest.doMock("../src/utils", () => ({
            __esModule: true,
            default: jest.fn().mockImplementation(() => ({
                getSponsorTimeFromUUID: jest.fn((segments, uuid) => segments.find((segment) => segment.UUID === uuid)),
                addHiddenSegment: jest.fn(),
            })),
        }));
    }

    function installChromeMock(): void {
        (global as unknown as { chrome: typeof chrome }).chrome = {
            runtime: {
                onMessage: {
                    addListener: jest.fn(),
                },
                sendMessage: jest.fn(),
                getManifest: jest.fn(() => ({
                    manifest_version: 3,
                    version: "0.1.10",
                })),
                id: "test-extension",
                lastError: null,
            },
            storage: {
                sync: {
                    get: jest.fn((_: unknown, callback: (value: Record<string, unknown>) => void) => callback({})),
                    set: jest.fn(),
                    remove: jest.fn(),
                },
                local: {
                    get: jest.fn((_: unknown, callback: (value: Record<string, unknown>) => void) => callback({})),
                    set: jest.fn((_: unknown, callback?: () => void) => callback?.()),
                    remove: jest.fn(),
                },
                onChanged: {
                    addListener: jest.fn(),
                },
            },
            i18n: {
                getMessage: jest.fn(() => ""),
            },
            extension: {
                inIncognitoContext: false,
            },
            tabs: undefined,
        } as unknown as typeof chrome;
    }

    beforeEach(() => {
        jest.resetModules();
        installChromeMock();
        installModuleMocks();
        document.body.innerHTML = "<div></div>";
    });

    test("sponsorStart dispatches commands and returns current creation state", async () => {
        try {
            const { createContentApp } = await import("../src/content/app");
            const { handleContentMessage } = await import("../src/content/messageHandler");
            const app = createContentApp();

            let toggled = false;
            app.commands.register("segment/toggleCapture", () => {
                toggled = true;
            });
            app.commands.register("segment/isCreationInProgress", () => true);

            const sendResponse = jest.fn();

            handleContentMessage({ message: "sponsorStart" }, null, sendResponse);

            expect(toggled).toBe(true);
            expect(sendResponse).toHaveBeenCalledWith({ creatingSegment: true });
        } catch (error) {
            throw new Error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
        }
    });

    test("submitTimes maps to the open submission command", async () => {
        try {
            const { createContentApp } = await import("../src/content/app");
            const { handleContentMessage } = await import("../src/content/messageHandler");
            const app = createContentApp();

            let opened = false;
            app.commands.register("segment/openSubmissionMenu", () => {
                opened = true;
            });

            const sendResponse = jest.fn();

            handleContentMessage({ message: "submitTimes" }, null, sendResponse);

            expect(opened).toBe(true);
            expect(sendResponse).toHaveBeenCalledWith({});
        } catch (error) {
            throw new Error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
        }
    });

    test("whitelistChange emits a business event and lets subscribers trigger segment lookup", async () => {
        try {
            const { createContentApp } = await import("../src/content/app");
            const { CONTENT_EVENTS } = await import("../src/content/app/events");
            const { handleContentMessage } = await import("../src/content/messageHandler");
            const { contentState } = await import("../src/content/state");
            const app = createContentApp();

            const whitelistEvents = [];
            let lookupCalls = 0;

            app.commands.register("segments/lookup", () => {
                lookupCalls += 1;
            });
            app.bus.on(CONTENT_EVENTS.CHANNEL_WHITELIST_CHANGED, (payload) => {
                whitelistEvents.push(payload);
                void app.commands.execute("segments/lookup", {});
            });

            const sendResponse = jest.fn();

            handleContentMessage({ message: "whitelistChange", value: true }, null, sendResponse);

            expect(contentState.channelWhitelisted).toBe(true);
            expect(whitelistEvents).toEqual([
                {
                    videoID: "BV1test",
                    whitelisted: true,
                    reason: "popupToggle",
                },
            ]);
            expect(lookupCalls).toBe(1);
            expect(sendResponse).toHaveBeenCalledWith({});
        } catch (error) {
            throw new Error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
        }
    });

    test("hideSegment emits segment/updated without directly calling preview bar commands", async () => {
        try {
            const { createContentApp } = await import("../src/content/app");
            const { CONTENT_EVENTS } = await import("../src/content/app/events");
            const { handleContentMessage } = await import("../src/content/messageHandler");
            const { contentState } = await import("../src/content/state");
            const app = createContentApp();

            const segment = {
                UUID: "test-segment" as SegmentUUID,
                cid: 1,
                segment: [0, 10] as [number, number],
                category: "sponsor",
                actionType: 0,
                source: 1,
                hidden: 0,
            } as unknown as SponsorTime;
            contentState.sponsorTimes = [segment];

            const updatedEvents = [];
            app.bus.on(CONTENT_EVENTS.SEGMENT_UPDATED, (payload) => {
                updatedEvents.push(payload);
            });

            const sendResponse = jest.fn();

            handleContentMessage(
                { message: "hideSegment", UUID: "test-segment" as SegmentUUID, type: 1 },
                null,
                sendResponse
            );

            expect(segment.hidden).toBe(1);
            expect(updatedEvents).toHaveLength(1);
            expect(updatedEvents[0]).toMatchObject({
                videoID: "BV1test",
                UUID: "test-segment",
                reason: "popupHide",
            });
            expect(updatedEvents[0].segment).toBe(segment);
            expect(sendResponse).toHaveBeenCalledWith({});
        } catch (error) {
            throw new Error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
        }
    });

    test("isInfoFound returns current backend metadata with loaded segments", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { handleContentMessage } = await import("../src/content/messageHandler");
        const { contentState } = await import("../src/content/state");
        createContentApp();

        contentState.lastResponseStatus = 200;
        contentState.sponsorDataFound = true;
        contentState.backendInfo = {
            main: {
                backendId: "main",
                name: "Main backend",
                capabilities: ["GET /api/skipSegments"],
            },
        };
        const sendResponse = jest.fn();

        handleContentMessage({ message: "isInfoFound", updating: true }, null, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
            backendInfo: contentState.backendInfo,
        }));
    });
});
