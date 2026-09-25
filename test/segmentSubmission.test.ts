/** @jest-environment jsdom */

import type { SegmentUUID, SponsorTime } from "../src/types";

describe("segment submission business events", () => {
    function installChromeMock(): void {
        (global as unknown as { chrome: typeof chrome }).chrome = {
            runtime: {
                sendMessage: jest.fn((message: unknown, callback?: (response: Record<string, unknown>) => void) => {
                    void message;
                    callback?.({ successType: 1 });
                }),
                getManifest: jest.fn(() => ({
                    manifest_version: 3,
                    version: "0.1.10",
                })),
                getURL: jest.fn((path: string) => path),
                id: "test-extension",
                lastError: null,
                onMessage: {
                    addListener: jest.fn(),
                },
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

    function installModuleMocks(): void {
        jest.doMock("../src/config", () => ({
            __esModule: true,
            default: {
                config: {
                    isVip: false,
                    minutesSaved: 0,
                    skipCount: 0,
                    defaultCategory: "sponsor",
                },
                local: {
                    downvotedSegments: {},
                    unsubmittedSegments: {},
                },
                forceLocalUpdate: jest.fn(),
            },
        }));
        jest.doMock("../src/config/config", () => ({
            keybindToString: jest.fn(() => "P"),
        }));
        jest.doMock("../src/components/SkipNoticeComponent", () => ({
            __esModule: true,
            default: class SkipNoticeComponentMock {},
        }));
        jest.doMock("../src/js-components/skipButtonControlBar", () => ({
            SkipButtonControlBar: class SkipButtonControlBarMock {},
        }));
        jest.doMock("../src/render/CategoryPill", () => ({
            CategoryPill: class CategoryPillMock {},
        }));
        jest.doMock("../src/render/DescriptionPortPill", () => ({
            DescriptionPortPill: class DescriptionPortPillMock {},
        }));
        jest.doMock("../src/render/MessageNotice", () => ({
            showMessage: jest.fn(),
        }));
        jest.doMock("../src/render/PlayerButton", () => ({
            PlayerButton: class PlayerButtonMock {
                createButtons = jest.fn(async () => ({}));
                updateSegmentSubmitting = jest.fn();
            },
        }));
        jest.doMock("../src/render/SubmissionNotice", () => ({
            __esModule: true,
            default: class SubmissionNoticeMock {},
        }));
        jest.doMock("../src/render/SkipNotice", () => ({
            __esModule: true,
            default: class SkipNoticeMock {},
        }));
        jest.doMock("../src/render/advanceSkipNotice", () => ({
            __esModule: true,
            default: class AdvanceSkipNoticeMock {},
        }));
        jest.doMock("../src/requests/portVideo", () => ({
            getPortVideoByHash: jest.fn(),
            postPortVideo: jest.fn(),
            postPortVideoVote: jest.fn(),
            updatePortedSegments: jest.fn(),
        }));
        jest.doMock("../src/requests/requests", () => ({
            asyncRequestToServer: jest.fn(),
        }));
        jest.doMock("../src/requests/segments", () => ({
            getSegmentsByVideoID: jest.fn(),
        }));
        jest.doMock("../src/requests/videoLabels", () => ({
            getVideoLabel: jest.fn(),
        }));
        jest.doMock("../src/utils", () => ({
            __esModule: true,
            default: jest.fn().mockImplementation(() => ({
                getSponsorIndexFromUUID: jest.fn((segments, uuid) => segments.findIndex((segment) => segment.UUID === uuid)),
                getSponsorTimeFromUUID: jest.fn((segments, uuid) => segments.find((segment) => segment.UUID === uuid)),
                addHiddenSegment: jest.fn(),
            })),
        }));
        jest.doMock("../src/utils/", () => ({
            waitFor: jest.fn(),
        }));
        jest.doMock("../src/utils/animationUtils", () => ({
            AnimationUtils: {
                applyLoadingAnimation: jest.fn(() => jest.fn()),
            },
        }));
        jest.doMock("../src/utils/constants", () => ({
            defaultPreviewTime: 2,
        }));
        jest.doMock("../src/utils/duraionUtils", () => ({
            durationEquals: jest.fn(() => true),
        }));
        jest.doMock("../src/utils/formating", () => ({
            getErrorMessage: jest.fn(() => "error"),
            getFormattedTime: jest.fn((time: number) => String(time)),
        }));
        jest.doMock("../src/utils/hash", () => ({
            getHash: jest.fn(async () => "hash"),
            getVideoIDHash: jest.fn(async () => "hash"),
            HashedValue: String,
        }));
        jest.doMock("../src/utils/injectedScriptMessageUtils", () => ({
            getCidMapFromWindow: jest.fn(async () => new Map()),
            sourceId: "test-source-id",
        }));
        jest.doMock("../src/utils/pageUtils", () => ({
            getHashParams: jest.fn(() => ({})),
        }));
        jest.doMock("../src/utils/setup", () => ({
            generateUserID: jest.fn(() => "generated-uuid"),
        }));
        jest.doMock("../src/utils/video", () => ({
            getBvID: jest.fn(() => "BV1test"),
            getCid: jest.fn(() => 1),
            getVideo: jest.fn(() => ({ duration: 100, currentTime: 0 })),
            getVideoID: jest.fn(() => "BV1test"),
            waitForVideo: jest.fn(),
        }));
        jest.doMock("../src/utils/videoIdUtils", () => ({
            parseBvidAndCidFromVideoId: jest.fn(() => ({ bvId: "BV1test", cid: 1 })),
        }));
        jest.doMock("../src/utils/warnings", () => ({
            openWarningDialog: jest.fn(),
        }));
        jest.doMock("../src/content/hotkeyHandler", () => ({
            seekFrameByKeyPressListener: jest.fn(),
        }));
        jest.doMock("../src/content/playerUi", () => ({
            waitForPlayerUiReady: jest.fn(async () => ({})),
        }));
        jest.doMock("../src/content/skipNoticeContentContainer", () => ({
            getSkipNoticeContentContainer: jest.fn(),
        }));
    }

    beforeEach(() => {
        jest.resetModules();
        installChromeMock();
        installModuleMocks();
        document.body.innerHTML = "<div></div>";
    });

    test("voteAsync emits segment/updated after a successful vote updates local state", async () => {
        try {
            const { createContentApp } = await import("../src/content/app");
            const { CONTENT_EVENTS } = await import("../src/content/app/events");
            const { contentState } = await import("../src/content/state");
            const { SponsorHideType, SponsorSourceType, ActionType } = await import("../src/types");
            const { voteAsync } = await import("../src/content/segmentSubmission");

            const app = createContentApp();

            const segmentUpdatedEvents = [];
            app.bus.on(CONTENT_EVENTS.SEGMENT_UPDATED, (payload) => {
                segmentUpdatedEvents.push(payload);
            });

            const segment = {
                UUID: "server-segment" as SegmentUUID,
                cid: "1",
                segment: [0, 10] as [number, number],
                category: "sponsor",
                actionType: ActionType.Skip,
                source: SponsorSourceType.Server,
                hidden: SponsorHideType.Downvoted,
            } as unknown as SponsorTime;
            contentState.sponsorTimes = [segment];

            const response = await voteAsync(1, "server-segment" as SegmentUUID);

            expect(response).toMatchObject({ successType: 1 });
            expect(segment.hidden).toBe(SponsorHideType.Visible);
            expect(segmentUpdatedEvents).toEqual([
                expect.objectContaining({
                    videoID: "BV1test",
                    UUID: "server-segment",
                    segment,
                    reason: "voteUp",
                }),
            ]);
        } catch (error) {
            throw new Error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
        }
    });

    test("segments/addSubmitting persists state and emits submitting changed", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { contentState } = await import("../src/content/state");
        const Config = (await import("../src/config")).default;
        const { registerSegmentSubmission } = await import("../src/content/segmentSubmission");
        const { ActionType, SponsorSourceType } = await import("../src/types");
        const app = createContentApp();
        const submittingEvents = [];
        const segment = {
            UUID: "draft-1" as SegmentUUID,
            cid: 1,
            segment: [1, 2],
            category: "sponsor",
            actionType: ActionType.Skip,
            source: SponsorSourceType.Local,
        } as unknown as SponsorTime;

        registerSegmentSubmission();
        app.bus.on(CONTENT_EVENTS.SEGMENTS_SUBMITTING_CHANGED, (payload) => {
            submittingEvents.push(payload);
        });

        app.commands.execute("segments/addSubmitting", { segment, source: "test.addSubmitting" });

        expect(contentState.sponsorTimesSubmitting).toEqual([segment]);
        expect(Config.local.unsubmittedSegments.BV1test).toEqual([segment]);
        expect(Config.forceLocalUpdate).toHaveBeenCalledWith("unsubmittedSegments");
        expect(app.store.getState().sponsorTimesSubmitting).toEqual([segment]);
        expect(submittingEvents).toEqual([
            expect.objectContaining({
                sponsorTimesSubmitting: [segment],
                getFromConfig: false,
                videoID: "BV1test",
            }),
        ]);
    });

    test("segments/replaceSubmitting and removeSubmitting persist and emit through the unified path", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { contentState } = await import("../src/content/state");
        const Config = (await import("../src/config")).default;
        const { registerSegmentSubmission } = await import("../src/content/segmentSubmission");
        const { ActionType, SponsorSourceType } = await import("../src/types");
        const app = createContentApp();
        const submittingEvents = [];
        const firstSegment = {
            UUID: "draft-1" as SegmentUUID,
            cid: 1,
            segment: [1, 2],
            category: "sponsor",
            actionType: ActionType.Skip,
            source: SponsorSourceType.Local,
        } as unknown as SponsorTime;
        const secondSegment = {
            UUID: "draft-2" as SegmentUUID,
            cid: 1,
            segment: [3, 4],
            category: "intro",
            actionType: ActionType.Skip,
            source: SponsorSourceType.Local,
        } as unknown as SponsorTime;

        registerSegmentSubmission();
        app.bus.on(CONTENT_EVENTS.SEGMENTS_SUBMITTING_CHANGED, (payload) => {
            submittingEvents.push(payload);
        });

        app.commands.execute("segments/replaceSubmitting", {
            segments: [firstSegment, secondSegment],
            source: "test.replaceSubmitting",
        });
        app.commands.execute("segments/removeSubmitting", { index: 0, source: "test.removeSubmitting" });

        expect(contentState.sponsorTimesSubmitting).toEqual([secondSegment]);
        expect(Config.local.unsubmittedSegments.BV1test).toEqual([secondSegment]);
        expect(submittingEvents).toHaveLength(2);
        expect(submittingEvents[1]).toEqual(
            expect.objectContaining({
                sponsorTimesSubmitting: [secondSegment],
                getFromConfig: false,
                videoID: "BV1test",
            })
        );
    });

    test("segments/clearSubmitting clears config-only drafts and emits submitting changed", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const Config = (await import("../src/config")).default;
        const { registerSegmentSubmission } = await import("../src/content/segmentSubmission");
        const { ActionType, SponsorSourceType } = await import("../src/types");
        const app = createContentApp();
        const submittingEvents = [];
        Config.local.unsubmittedSegments.BV1test = [
            {
                UUID: "draft-1" as SegmentUUID,
                cid: 1,
                segment: [1, 2],
                category: "sponsor",
                actionType: ActionType.Skip,
                source: SponsorSourceType.Local,
            } as unknown as SponsorTime,
        ];

        registerSegmentSubmission();
        app.bus.on(CONTENT_EVENTS.SEGMENTS_SUBMITTING_CHANGED, (payload) => {
            submittingEvents.push(payload);
        });

        app.commands.execute("segments/clearSubmitting", { source: "test.clearSubmitting" });

        expect(Config.local.unsubmittedSegments.BV1test).toBeUndefined();
        expect(submittingEvents).toEqual([
            expect.objectContaining({
                sponsorTimesSubmitting: [],
                getFromConfig: false,
                videoID: "BV1test",
            }),
        ]);
    });

    test("segments/updateSubmitting clears stale state when config has no current video draft", async () => {
        const { createContentApp } = await import("../src/content/app");
        const { CONTENT_EVENTS } = await import("../src/content/app/events");
        const { contentState } = await import("../src/content/state");
        const { registerSegmentSubmission } = await import("../src/content/segmentSubmission");
        const { ActionType, SponsorSourceType } = await import("../src/types");
        const app = createContentApp();
        const submittingEvents = [];
        contentState.sponsorTimesSubmitting = [
            {
                UUID: "stale-draft" as SegmentUUID,
                cid: 1,
                segment: [1, 2],
                category: "sponsor",
                actionType: ActionType.Skip,
                source: SponsorSourceType.Local,
            } as unknown as SponsorTime,
        ];

        registerSegmentSubmission();
        app.bus.on(CONTENT_EVENTS.SEGMENTS_SUBMITTING_CHANGED, (payload) => {
            submittingEvents.push(payload);
        });

        app.commands.execute("segments/updateSubmitting", { getFromConfig: true });

        expect(contentState.sponsorTimesSubmitting).toEqual([]);
        expect(submittingEvents).toEqual([
            expect.objectContaining({
                sponsorTimesSubmitting: [],
                getFromConfig: true,
                videoID: "BV1test",
            }),
        ]);
    });

    test("segments/updateSubmitting preloaded duplicate check compares both start and end times", async () => {
        const { createContentApp } = await import("../src/content/app");
        const Config = (await import("../src/config")).default;
        const pageUtils = await import("../src/utils/pageUtils");
        const { contentState } = await import("../src/content/state");
        const { registerSegmentSubmission } = await import("../src/content/segmentSubmission");
        const { ActionType, SponsorSourceType } = await import("../src/types");
        const app = createContentApp();
        const existingSegment = {
            UUID: "existing-draft" as SegmentUUID,
            cid: 1,
            segment: [1, 2],
            category: "sponsor",
            actionType: ActionType.Skip,
            source: SponsorSourceType.Local,
        } as unknown as SponsorTime;
        Config.local.unsubmittedSegments.BV1test = [existingSegment];
        (pageUtils.getHashParams as jest.Mock).mockReturnValue({
            segments: [
                { segment: [1, 2], category: "sponsor", actionType: ActionType.Skip },
                { segment: [1, 3], category: "sponsor", actionType: ActionType.Skip },
            ],
        });

        registerSegmentSubmission();
        app.commands.execute("segments/updateSubmitting", { getFromConfig: true });

        expect(contentState.sponsorTimesSubmitting.map((segment) => segment.segment)).toEqual([[1, 2], [1, 3]]);
        expect(Config.local.unsubmittedSegments.BV1test.map((segment) => segment.segment)).toEqual([[1, 2], [1, 3]]);
    });
});
