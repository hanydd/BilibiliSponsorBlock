import SkipNoticeComponent from "../components/SkipNoticeComponent";
import Config from "../config";
import { keybindToString } from "../config/config";
import { SkipButtonControlBar } from "../js-components/skipButtonControlBar";
import { VoteResponse } from "../messageTypes";
import { CategoryPill } from "../render/CategoryPill";
import { DescriptionPortPill } from "../render/DescriptionPortPill";
import { showMessage } from "../render/MessageNotice";
import { PlayerButton } from "../render/PlayerButton";
import SubmissionNotice from "../render/SubmissionNotice";
import { getPortVideoByHash, postPortVideo, postPortVideoVote, updatePortedSegments } from "../requests/portVideo";
import { asyncRequestToServer } from "../requests/requests";
import { getSegmentsByVideoID } from "../requests/segments";
import { FetchResponse } from "../requests/type/requestType";
import { getVideoLabel } from "../requests/videoLabels";
import {
    ActionType,
    BVID,
    Category,
    NewVideoID,
    PortVideo,
    SegmentUUID,
    SponsorHideType,
    SponsorSourceType,
    SponsorTime,
    YTID,
} from "../types";
import Utils from "../utils";
import { isSafari, waitFor } from "../utils/";
import { AnimationUtils } from "../utils/animationUtils";
import { defaultPreviewTime } from "../utils/constants";
import { durationEquals } from "../utils/duraionUtils";
import { removePageCidMap } from "../utils/exporter";
import { getErrorMessage, getFormattedTime } from "../utils/formating";
import { getHash, getVideoIDHash, HashedValue } from "../utils/hash";
import { getCidMapFromWindow } from "../utils/injectedScriptMessageUtils";
import { logUiLifecycle } from "../utils/logger";
import { getHashParams } from "../utils/pageUtils";
import { generateUserID } from "../utils/setup";
import { getBvID, getCid, getVideo, getVideoID, waitForVideo } from "../utils/video";
import { parseBvidAndCidFromVideoId } from "../utils/videoIdUtils";
import { openWarningDialog } from "../utils/warnings";
import { handleContentMessage } from "./messageHandler";
import { getContentApp } from "./app";
import { CONTENT_EVENTS } from "./app/events";
import { seekFrameByKeyPressListener } from "./hotkeyHandler";
import { waitForPlayerUiReady } from "./playerUi";
import { getSkipNoticeContentContainer } from "./skipNoticeContentContainer";
import { contentState, syncContentStateStore } from "./state";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";

const utils = new Utils();

let lookupWaiting = false;
let loadedPreloadedSegment = false;
let safariPopupRoot: Root = null;

function getUIState() {
    return getContentApp().ui.getState();
}

function patchUIState(patch: Partial<ReturnType<typeof getUIState>>): void {
    getContentApp().ui.patchState(patch);
}

function getPlayerButton(): PlayerButton {
    const app = getContentApp();
    const existingButton = app.ui.getState().playerButton;
    if (existingButton) {
        return existingButton;
    }

    const playerButton = new PlayerButton(
        () => void app.commands.execute("segment/toggleCapture", undefined),
        () => void app.commands.execute("segment/cancelCapture", undefined),
        clearSponsorTimes,
        () => void app.commands.execute("segment/openSubmissionMenu", undefined),
        () => void app.commands.execute("popup/openInfoMenu", undefined)
    );
    app.ui.patchState({ playerButton });
    return playerButton;
}

function emitSubmittingChanged(getFromConfig: boolean, source: string): void {
    syncContentStateStore(source);
    getContentApp().bus.emit(
        CONTENT_EVENTS.SEGMENTS_SUBMITTING_CHANGED,
        {
            sponsorTimesSubmitting: contentState.sponsorTimesSubmitting,
            getFromConfig,
            videoID: getVideoID(),
        },
        { source }
    );
}

interface CommitSubmittingSegmentsOptions {
    source: string;
    getFromConfig?: boolean;
    persist?: boolean;
    videoID?: NewVideoID | null;
}

function cloneSubmittingSegment(segment: SponsorTime): SponsorTime {
    return {
        ...segment,
        segment: [...segment.segment] as SponsorTime["segment"],
    };
}

function persistSubmittingSegments(videoID: NewVideoID | null, segments: SponsorTime[]): void {
    if (!videoID) return;

    if (segments.length > 0) {
        void storePageCidMap(getBvID()!);
        Config.local.unsubmittedSegments[videoID] = segments.map(cloneSubmittingSegment);
    } else {
        delete Config.local.unsubmittedSegments[videoID];
        removePageCidMap(videoID);
    }

    Config.forceLocalUpdate("unsubmittedSegments");
}

function commitSubmittingSegments(nextSegments: SponsorTime[], options: CommitSubmittingSegmentsOptions): void {
    const videoID = options.videoID ?? getVideoID();
    const segments = nextSegments.map(cloneSubmittingSegment);

    if (options.persist) {
        persistSubmittingSegments(videoID, segments);
    }

    contentState.sponsorTimesSubmitting = segments;

    if (options.getFromConfig && segments.length > 0) {
        contentState.previewedSegment = true;
    }

    emitSubmittingChanged(Boolean(options.getFromConfig), options.source);
}

function loadSubmittingSegmentsFromConfig(videoID: NewVideoID | null = getVideoID()): SponsorTime[] {
    const segmentTimes = videoID ? Config.local.unsubmittedSegments[videoID] : undefined;
    if (segmentTimes === undefined) {
        return [];
    }

    return segmentTimes.map((segmentTime) => ({
        ...cloneSubmittingSegment(segmentTime),
        cid: getCid(),
    }));
}

function addSubmittingSegment(segment: SponsorTime, source = "segmentSubmission.addSubmittingSegment"): void {
    commitSubmittingSegments([...contentState.sponsorTimesSubmitting, segment], {
        source,
        persist: true,
    });
}

function replaceSubmittingSegments(
    segments: SponsorTime[],
    source = "segmentSubmission.replaceSubmittingSegments",
    getFromConfig = false
): void {
    commitSubmittingSegments(segments, {
        source,
        getFromConfig,
        persist: true,
    });
}

function removeSubmittingSegment(index: number, source = "segmentSubmission.removeSubmittingSegment"): void {
    if (index < 0 || index >= contentState.sponsorTimesSubmitting.length) {
        return;
    }

    replaceSubmittingSegments(
        contentState.sponsorTimesSubmitting.filter((_, i) => i !== index),
        source
    );
}

function clearSubmittingSegments(source = "segmentSubmission.clearSubmittingSegments", resetNotice = false): void {
    const videoID = getVideoID();
    const hasConfigSegments = Boolean(videoID && Config.local.unsubmittedSegments[videoID]?.length > 0);
    const hasStateSegments = contentState.sponsorTimesSubmitting.length > 0;

    if (!hasConfigSegments && !hasStateSegments) {
        return;
    }

    if (resetNotice) {
        resetSponsorSubmissionNotice();
    }

    commitSubmittingSegments([], {
        source,
        persist: true,
        videoID,
    });
}

function emitSegmentsLoaded(source: string): void {
    syncContentStateStore(source);
    getContentApp().bus.emit(
        CONTENT_EVENTS.SEGMENTS_LOADED,
        {
            sponsorTimes: contentState.sponsorTimes,
            status: contentState.lastResponseStatus,
            videoID: getVideoID(),
        },
        { source }
    );
}

function emitSegmentUpdated(
    segment: SponsorTime,
    reason: "popupHide" | "voteDown" | "voteUp" | "categoryVote",
    source: string
): void {
    syncContentStateStore(source);
    getContentApp().bus.emit(
        CONTENT_EVENTS.SEGMENT_UPDATED,
        {
            videoID: getVideoID(),
            UUID: segment.UUID,
            segment,
            reason,
        },
        { source }
    );
}

function disableSkipButtonIfNoVisiblePoi(source: string): void {
    if (
        getUIState().skipButtonControlBar?.isEnabled() &&
        contentState.sponsorTimesSubmitting.every(
            (s) => s.hidden !== SponsorHideType.Visible || s.actionType !== ActionType.Poi
        )
    ) {
        getContentApp().bus.emit(
            CONTENT_EVENTS.SKIP_BUTTON_STATE_CHANGED,
            {
                enabled: false,
                segment: null,
            },
            { source }
        );
    }
}

function sendInfoUpdatedMessage(portVideo = contentState.portVideo): void {
    chrome.runtime.sendMessage({
        message: "infoUpdated",
        found: contentState.sponsorDataFound,
        status: contentState.lastResponseStatus,
        sponsorTimes: contentState.sponsorTimes,
        portVideo,
        time: getVideo()?.currentTime ?? 0,
    });
}

async function storePageCidMap(bvid: BVID): Promise<void> {
    const mapData = Config.local!.videoPageCidMap ?? {};
    // 获取当前稿件的 CID 映射并在扩展程序存储（本地）中持久化
    const cidMap = await getCidMapFromWindow(bvid);
    if (cidMap && cidMap.size > 0) {
        mapData[bvid] = Object.fromEntries(cidMap);
        Config.local!.videoPageCidMap = mapData;
        Config.forceLocalUpdate("videoPageCidMap");
    }
}

export function getSkipButtonControlBar() { return getUIState().skipButtonControlBar; }
export function getCategoryPill() { return getUIState().categoryPill; }
export function getPopupInitialised() { return getUIState().popupInitialised; }
export function setPopupInitialised(v: boolean) { patchUIState({ popupInitialised: v }); }
export function getSubmissionNotice() { return getUIState().submissionNotice; }

export function resetSubmissionState(): void {
    loadedPreloadedSegment = false;
    lookupWaiting = false;
    const { submissionNotice } = getUIState();
    if (submissionNotice) {
        submissionNotice.close();
    }
    patchUIState({
        playerButtons: {},
        descriptionPill: null,
        submissionNotice: null,
        popupInitialised: false,
        skipButtonControlBar: null,
        categoryPill: null,
    });
}

export function registerSegmentSubmission(): void {
    const app = getContentApp();

    app.commands.register("segment/toggleCapture", () => startOrEndTimingNewSegment());
    app.commands.register("segment/cancelCapture", () => cancelCreatingSegment());
    app.commands.register("segment/submit", () => submitSegments());
    app.commands.register("segment/openSubmissionMenu", () => openSubmissionMenu());
    app.commands.register("segment/previewRecent", () => previewRecentSegment());
    app.commands.register("segment/isCreationInProgress", () => isSegmentCreationInProgress());
    app.commands.register("segment/getRealCurrentTime", () => getRealCurrentTime());
    app.commands.register("segment/resetSubmissionNotice", ({ callRef }) => resetSponsorSubmissionNotice(callRef));
    app.commands.register("segment/vote", ({ type, UUID, category, skipNotice }) => vote(type, UUID, category, skipNotice));
    app.commands.register("segment/voteAsync", ({ type, UUID, category }) => voteAsync(type, UUID, category));
    app.commands.register("segments/lookup", ({ keepOldSubmissions, ignoreServerCache, forceUpdatePreviewBar }) =>
        sponsorsLookup(keepOldSubmissions, ignoreServerCache, forceUpdatePreviewBar)
    );
    app.commands.register("segments/updateSubmitting", ({ getFromConfig }) =>
        updateSponsorTimesSubmitting(getFromConfig)
    );
    app.commands.register("segments/addSubmitting", ({ segment, source }) => addSubmittingSegment(segment, source));
    app.commands.register("segments/replaceSubmitting", ({ segments, source, getFromConfig }) =>
        replaceSubmittingSegments(segments, source, getFromConfig)
    );
    app.commands.register("segments/removeSubmitting", ({ index, source }) => removeSubmittingSegment(index, source));
    app.commands.register("segments/clearSubmitting", ({ source, resetNotice }) =>
        clearSubmittingSegments(source, resetNotice)
    );
    app.commands.register("segments/import", ({ importedSegments }) => importSegments(importedSegments));
    app.commands.register("ui/updatePlayerButtons", () => updateVisibilityOfPlayerControlsButton());
    app.commands.register("ui/setupSkipButtonControlBar", () => setupSkipButtonControlBar());
    app.commands.register("ui/setupCategoryPill", () => setupCategoryPill());
    app.commands.register("ui/setupDescriptionPill", () => setupDescriptionPill());
    app.commands.register("popup/openInfoMenu", () => openInfoMenu());
    app.commands.register("popup/closeInfoMenu", () => closeInfoMenu());
    app.commands.register("port/submitVideo", ({ ytbID }) => submitPortVideo(ytbID));
    app.commands.register("port/voteVideo", ({ UUID, vote }) => portVideoVote(UUID, vote));
    app.commands.register("port/updateSegments", ({ UUID }) => updateSegments(UUID));

    app.bus.on(CONTENT_EVENTS.SEGMENTS_LOADED, ({ videoID }) => {
        if (videoID !== getVideoID()) {
            return;
        }

        sendInfoUpdatedMessage();

        if (Config.config.isVip) {
            void lockedCategoriesLookup();
        }
    });
    app.bus.on(CONTENT_EVENTS.SEGMENTS_SUBMITTING_CHANGED, ({ videoID }) => {
        if (videoID !== getVideoID()) {
            return;
        }

        void updateVisibilityOfPlayerControlsButton();
        getUIState().submissionNotice?.update();
    });
    app.bus.on(CONTENT_EVENTS.SEGMENT_UPDATED, ({ videoID }) => {
        if (videoID !== getVideoID()) {
            return;
        }

        disableSkipButtonIfNoVisiblePoi("segmentSubmission.segmentUpdated");
    });
}

export function setupSkipButtonControlBar(): void {
    const { skipButtonControlBar } = getUIState();
    if (!skipButtonControlBar) {
        const nextSkipButtonControlBar = new SkipButtonControlBar({
            skip: (segment) =>
                void getContentApp().commands.execute("skip/execute", {
                    v: getVideo(),
                    skipTime: segment.segment,
                    skippingSegments: [segment],
                    openNotice: true,
                    forceAutoSkip: true,
                }),
            selectSegment: (UUID) => void getContentApp().commands.execute("segments/select", { UUID }),
        });
        patchUIState({ skipButtonControlBar: nextSkipButtonControlBar });
        logUiLifecycle("skipButton", "attach", {
            action: "create",
            debugId: nextSkipButtonControlBar.debugId,
        });
    }

    logUiLifecycle("skipButton", "wait", {
        target: "controls",
        action: "attach",
        debugId: getSkipButtonControlBar()?.debugId,
    });
    void waitForPlayerUiReady()
        .then(() => getSkipButtonControlBar()?.attachToPage())
        .catch(() => undefined);
}

export function setupCategoryPill(): void {
    let { categoryPill } = getUIState();
    logUiLifecycle("categoryPill", "state", {
        action: "setupRequested",
        existing: Boolean(categoryPill),
        fullVideoSegmentPresent: contentState.sponsorTimes?.some((time) => time.actionType === ActionType.Full) ?? false,
        videoID: getVideoID(),
    });

    if (!categoryPill) {
        categoryPill = new CategoryPill();
        patchUIState({ categoryPill });
        logUiLifecycle("categoryPill", "attach", {
            action: "create",
            videoID: getVideoID(),
        });
    }

    void categoryPill.attachToPage(voteAsync);

    const fullVideoSegment = contentState.sponsorTimes?.find((time) => time.actionType === ActionType.Full);
    if (fullVideoSegment) {
        logUiLifecycle("categoryPill", "state", {
            action: "restoreExistingSegment",
            UUID: fullVideoSegment.UUID,
            category: fullVideoSegment.category,
            videoID: getVideoID(),
        });
        void categoryPill.setSegment(fullVideoSegment);
    }
}

export function setupDescriptionPill(): void {
    let { descriptionPill } = getUIState();
    if (!descriptionPill) {
        descriptionPill = new DescriptionPortPill(
            getPortVideo,
            submitPortVideo,
            portVideoVote,
            updateSegments,
            sponsorsLookup
        );
        patchUIState({ descriptionPill });
    }
    descriptionPill.setupDescription(getVideoID());
}

export async function updatePortVideoElements(newPortVideo: PortVideo): Promise<void> {
    contentState.portVideo = newPortVideo;
    waitFor(() => getUIState().descriptionPill).then(() => getUIState().descriptionPill.setPortVideoData(newPortVideo));
    syncContentStateStore("segmentSubmission.updatePortVideoElements");
    sendInfoUpdatedMessage(newPortVideo);
}

export async function getPortVideo(videoId: NewVideoID, bypassCache = false): Promise<void> {
    const newPortVideo = await getPortVideoByHash(videoId, { bypassCache });
    if (newPortVideo?.UUID === contentState.portVideo?.UUID) return;
    contentState.portVideo = newPortVideo;

    updatePortVideoElements(contentState.portVideo);
}

export async function submitPortVideo(ytbID: YTID): Promise<PortVideo> {
    const newPortVideo = await postPortVideo(getVideoID(), ytbID, getVideo()?.duration);
    contentState.portVideo = newPortVideo;
    updatePortVideoElements(contentState.portVideo);
    sponsorsLookup(true, true, true);
    return newPortVideo;
}

export async function portVideoVote(UUID: string, voteType: number): Promise<void> {
    await postPortVideoVote(UUID, getVideoID(), voteType);
    await getPortVideo(getVideoID(), true);
}

export async function updateSegments(UUID: string): Promise<FetchResponse> {
    const response = await updatePortedSegments(getVideoID(), UUID);
    if (response.ok) {
        sponsorsLookup(true, true, true);
    }
    return response;
}

export async function sponsorsLookup(keepOldSubmissions = true, ignoreServerCache = false, forceUpdatePreviewBar = false): Promise<void> {
    const videoID = getVideoID();
    const { bvId, cid } = parseBvidAndCidFromVideoId(videoID);
    void forceUpdatePreviewBar;
    if (!videoID) {
        console.error("[SponsorBlock] Attempted to fetch segments with a null/undefined videoID.");
        return;
    }
    if (lookupWaiting) return;

    if (!getVideo()) {
        await waitForVideo();

        lookupWaiting = true;
        setTimeout(() => {
            lookupWaiting = false;
            sponsorsLookup(keepOldSubmissions, ignoreServerCache, forceUpdatePreviewBar);
        }, 100);
        return;
    }

    const hashPrefix = (await getVideoIDHash(videoID)).slice(0, 4) as BVID & HashedValue;
    const segmentResponse = await getSegmentsByVideoID(videoID, ignoreServerCache);

    if (videoID !== getVideoID()) return;

    contentState.lastResponseStatus = segmentResponse?.status;

    if (segmentResponse.status === 200) {
        let receivedSegments: SponsorTime[] = segmentResponse.segments?.filter(segment => segment.cid === cid);

        const uniqueCids = new Set(segmentResponse?.segments?.filter((segment) => durationEquals(segment.videoDuration, getVideo()?.duration, 5)).map(s => s.cid));
        console.log("unique cids from segments", uniqueCids)
        if (uniqueCids.size > 1) {
            const cidMap = await getCidMapFromWindow(bvId);
            console.log("[BSB] Multiple CIDs found, using the one from the window object", cidMap);
            if (cidMap.size == 1) {
                receivedSegments = segmentResponse.segments?.filter(segment => uniqueCids.has(segment.cid));
            }
        }

        if (receivedSegments && receivedSegments.length) {
            contentState.sponsorDataFound = true;

            if (contentState.sponsorTimes !== null && keepOldSubmissions) {
                for (let i = 0; i < contentState.sponsorTimes.length; i++) {
                    if (contentState.sponsorTimes[i].source === SponsorSourceType.Local) {
                        receivedSegments.push(contentState.sponsorTimes[i]);
                    }
                }
            }

            const oldSegments = contentState.sponsorTimes || [];
            contentState.sponsorTimes = receivedSegments;

            if (Config.config.minDuration !== 0) {
                for (const segment of contentState.sponsorTimes) {
                    const duration = segment.segment[1] - segment.segment[0];
                    if (duration > 0 && duration < Config.config.minDuration) {
                        segment.hidden = SponsorHideType.MinimumDuration;
                    }
                }
            }

            if (keepOldSubmissions) {
                for (const segment of oldSegments) {
                    const otherSegment = contentState.sponsorTimes.find((other) => segment.UUID === other.UUID);
                    if (otherSegment) {
                        otherSegment.hidden = segment.hidden;
                        otherSegment.category = segment.category;
                    }
                }
            }

            const downvotedData = Config.local.downvotedSegments[hashPrefix];
            if (downvotedData) {
                for (const segment of contentState.sponsorTimes) {
                    const hashedUUID = await getHash(segment.UUID, 1);
                    const segmentDownvoteData = downvotedData.segments.find((downvote) => downvote.uuid === hashedUUID);
                    if (segmentDownvoteData) {
                        segment.hidden = segmentDownvoteData.hidden;
                    }
                }
            }
        }
    }
    emitSegmentsLoaded("segmentSubmission.sponsorsLookup");
}

export async function lockedCategoriesLookup(): Promise<void> {
    const hashPrefix = (await getHash(getVideoID(), 1)).slice(0, 4);
    const response = await asyncRequestToServer("GET", "/api/lockCategories/" + hashPrefix);

    if (response.ok) {
        try {
            const categoriesResponse = JSON.parse(response.responseText).filter(
                (lockInfo) => lockInfo.videoID === getVideoID()
            )[0]?.categories;
            if (Array.isArray(categoriesResponse)) {
                contentState.lockedCategories = categoriesResponse;
                syncContentStateStore("segmentSubmission.lockedCategoriesLookup");
            }
        } catch (e) { } //eslint-disable-line no-empty
    }
}

/** Creates any missing buttons on the player and updates their visiblity. */
export async function updateVisibilityOfPlayerControlsButton(): Promise<void> {
    if (!getVideoID()) return;

    await waitForPlayerUiReady();
    const playerButtons = await getPlayerButton().createButtons();
    patchUIState({ playerButtons: playerButtons ?? {} });
    logUiLifecycle("playerButtons", "state", {
        action: "updateVisibility",
        createdButtons: Object.keys(playerButtons ?? {}),
        videoID: getVideoID(),
    });

    updateSegmentSubmitting();
}

/** Updates the visibility of buttons on the player related to creating segments. */
export function updateSegmentSubmitting(): void {
    if (!getVideoID()) return;
    getPlayerButton().updateSegmentSubmitting(contentState.sponsorTimesSubmitting);
}

/**
 * Used for submitting. This will use the HTML displayed number when required as the video's
 * current time is out of date while scrubbing or at the end of the getVideo(). This is not needed
 * for sponsor skipping as the video is not playing during these times.
 */
export function getRealCurrentTime(): number {
    const endingDataSelect = document.querySelector(".bpx-player-ending-wrap")?.getAttribute("data-select");

    if (endingDataSelect === "1") {
        return getVideo()?.duration;
    } else {
        return getVideo().currentTime;
    }
}

export function startOrEndTimingNewSegment(): void {
    const roundedTime = Math.round((getRealCurrentTime() + Number.EPSILON) * 1000) / 1000;
    const nextSegments = contentState.sponsorTimesSubmitting.map(cloneSubmittingSegment);

    if (!isSegmentCreationInProgress()) {
        nextSegments.push({
            cid: getCid(),
            segment: [roundedTime],
            UUID: generateUserID() as SegmentUUID,
            category: Config.config.defaultCategory,
            actionType: ActionType.Skip,
            source: SponsorSourceType.Local,
        });
    } else {
        const existingSegment = nextSegments[nextSegments.length - 1];
        const existingTime = existingSegment.segment[0];
        const currentTime = roundedTime;

        existingSegment.segment = [Math.min(existingTime, currentTime), Math.max(existingTime, currentTime)];
    }

    replaceSubmittingSegments(nextSegments, "segmentSubmission.startOrEndTimingNewSegment");
    sponsorsLookup(true, true);

    if (
        contentState.lastResponseStatus !== 200 &&
        contentState.lastResponseStatus !== 404 &&
        !contentState.shownSegmentFailedToFetchWarning &&
        Config.config.showSegmentFailedToFetchWarning
    ) {
        showMessage(chrome.i18n.getMessage("segmentFetchFailureWarning"), "warning");

        contentState.shownSegmentFailedToFetchWarning = true;
    }
}

export function getIncompleteSegment(): SponsorTime {
    return contentState.sponsorTimesSubmitting[contentState.sponsorTimesSubmitting.length - 1];
}

/** Is the latest submitting segment incomplete */
export function isSegmentCreationInProgress(): boolean {
    const segment = getIncompleteSegment();
    return segment && segment?.segment?.length !== 2;
}

export function cancelCreatingSegment(): void {
    if (isSegmentCreationInProgress()) {
        if (contentState.sponsorTimesSubmitting.length > 1) {
            removeSubmittingSegment(
                contentState.sponsorTimesSubmitting.length - 1,
                "segmentSubmission.cancelCreatingSegment"
            );
        } else {
            clearSubmittingSegments("segmentSubmission.cancelCreatingSegment", true);
        }
    }
}

export function updateSponsorTimesSubmitting(getFromConfig = true): void {
    if (getFromConfig) {
        const preloaded = getSubmittingSegmentsWithPreloaded(loadSubmittingSegmentsFromConfig());
        commitSubmittingSegments(preloaded.segments, {
            source: "segmentSubmission.updateSponsorTimesSubmitting",
            getFromConfig,
            persist: preloaded.pushed,
        });

        return;
    }

    commitSubmittingSegments(contentState.sponsorTimesSubmitting, {
        source: "segmentSubmission.updateSponsorTimesSubmitting",
        getFromConfig,
        persist: false,
    });
}

export function openInfoMenu(): void {
    if (document.getElementById("sponsorBlockPopupContainer") != null) {
        return;
    }

    patchUIState({ popupInitialised: false });

    const popup = document.createElement("div");
    popup.id = "sponsorBlockPopupContainer";

    if (isSafari()) {
        setupSafariPopupHost(popup);
        const shadowRoot = popup.attachShadow({ mode: "open" });
        appendSafariPopupShadowStyles(shadowRoot);

        const popupHtml = document.createElement("div");
        popupHtml.id = "sponsorBlockPopupHTML";

        const popupBody = document.createElement("div");
        popupBody.id = "sponsorBlockPopupBody";

        const rootElement = document.createElement("div");
        popupBody.appendChild(rootElement);
        popupHtml.appendChild(popupBody);
        shadowRoot.appendChild(popupHtml);

        const container = document.querySelector("#danmukuBox") as HTMLElement;
        container.prepend(popup);

        void import("../popup/app").then(({ default: App }) => {
            if (!document.getElementById("sponsorBlockPopupContainer")) {
                return;
            }

            safariPopupRoot = createRoot(rootElement);
            safariPopupRoot.render(
                React.createElement(App, {
                    embedded: true,
                    styleContainer: shadowRoot,
                    keyboardEventTarget: shadowRoot,
                    messageListener: (request, sender, sendResponse) =>
                        handleContentMessage(request, sender, sendResponse),
                })
            );
            setTimeout(() => {
                shadowRoot.getElementById("sponsorblockPopup")?.classList.remove("sb-preload");
            }, 10);
        });
        return;
    }

    const frame = document.createElement("iframe");
    frame.width = "374";
    frame.height = "500";
    frame.style.borderRadius = "6px";
    frame.style.margin = "0px auto 20px";
    frame.addEventListener("load", async () => {
        frame.contentWindow.postMessage("", "*");

        const stylusStyle = document.querySelector(".stylus");
        if (stylusStyle) {
            frame.contentWindow.postMessage(
                {
                    type: "style",
                    css: stylusStyle.textContent,
                },
                "*"
            );
        }
    });
    frame.src = chrome.runtime.getURL("popup.html");
    popup.appendChild(frame);

    const container = document.querySelector("#danmukuBox") as HTMLElement;
    container.prepend(popup);
}

export function closeInfoMenu(): void {
    const popup = document.getElementById("sponsorBlockPopupContainer");
    if (popup === null) return;

    safariPopupRoot?.unmount();
    safariPopupRoot = null;

    popup.remove();

    window.dispatchEvent(new Event("closePopupMenu"));
    getContentApp().bus.emit(CONTENT_EVENTS.UI_POPUP_CLOSED, {}, { source: "segmentSubmission.closeInfoMenu" });
}

function setupSafariPopupHost(popup: HTMLElement): void {
    popup.style.position = "relative";
    popup.style.width = "374px";
    popup.style.maxWidth = "100%";
    popup.style.margin = "0 auto 16px";
    popup.style.overflow = "hidden";
    popup.style.borderRadius = "6px";
    popup.style.backgroundColor = "#222";
}

function appendSafariPopupShadowStyles(shadowRoot: ShadowRoot): void {
    const variables = document.createElement("style");
    variables.textContent = `
        :host,
        #sponsorBlockPopupBody {
            --sb-main-font-family: PingFang SC, HarmonyOS_Regular, Helvetica Neue, Microsoft YaHei, sans-serif;
            --sb-main-bg-color: #222;
            --sb-main-fg-color: #fff;
            --sb-grey-bg-color: #333;
            --sb-grey-fg-color: #999;
            --sb-red-bg-color: #00a1d6;
            color-scheme: dark;
        }

        #sponsorBlockPopupHTML {
            max-height: 500px;
            overflow-y: auto;
        }

        #sponsorBlockPopupBody {
            position: relative;
            width: 100%;
        }
    `;
    shadowRoot.appendChild(variables);

    for (const href of ["popup.css", "shared.css"]) {
        const styleSheet = document.createElement("link");
        styleSheet.rel = "stylesheet";
        styleSheet.href = chrome.runtime.getURL(href);
        shadowRoot.appendChild(styleSheet);
    }

    const stylusStyle = document.querySelector(".stylus");
    if (stylusStyle?.textContent) {
        const style = document.createElement("style");
        style.textContent = stylusStyle.textContent;
        shadowRoot.appendChild(style);
    }
}

export function clearSponsorTimes(): void {
    clearSubmittingSegments("segmentSubmission.clearSponsorTimes", true);
}

export function importSegments(importedSegments: SponsorTime[]): void {
    let addedSegments = false;
    const nextSegments = contentState.sponsorTimesSubmitting.map(cloneSubmittingSegment);

    for (const segment of importedSegments) {
        if (
            !nextSegments.some(
                (s) =>
                    Math.abs(s.segment[0] - segment.segment[0]) < 1 &&
                    Math.abs(s.segment[1] - segment.segment[1]) < 1
            )
        ) {
            nextSegments.push(segment);
            addedSegments = true;
        }
    }

    if (!addedSegments) {
        return;
    }

    replaceSubmittingSegments(nextSegments, "segmentSubmission.importSegments");
    openSubmissionMenu();
}

export async function vote(
    type: number,
    UUID: SegmentUUID,
    category?: Category,
    skipNotice?: SkipNoticeComponent
): Promise<VoteResponse> {
    if (skipNotice !== null && skipNotice !== undefined) {
        skipNotice.addVoteButtonInfo.bind(skipNotice)(chrome.i18n.getMessage("Loading"));
        skipNotice.setNoticeInfoMessage.bind(skipNotice)();
    }

    const response = await voteAsync(type, UUID, category);
        if (response != undefined) {
            if (skipNotice != null) {
                if (response.successType == 1 || (response.successType == -1 && response.statusCode == 429)) {
                    skipNotice.afterVote.bind(skipNotice)(utils.getSponsorTimeFromUUID(contentState.sponsorTimes, UUID), type, category);
                } else if (response.successType == -1) {
                    if (
                        response.statusCode === 403 &&
                        response.responseText.startsWith("Vote rejected due to a tip from a moderator.")
                    ) {
                        openWarningDialog();
                    } else {
                        skipNotice.setNoticeInfoMessage.bind(skipNotice)(
                            getErrorMessage(response.statusCode, response.responseText)
                        );
                    }

                skipNotice.resetVoteButtonInfo.bind(skipNotice)();
            }
        }
    }

    return response;
}

export async function voteAsync(type: number, UUID: SegmentUUID, category?: Category): Promise<VoteResponse | undefined> {
    const sponsorIndex = utils.getSponsorIndexFromUUID(contentState.sponsorTimes, UUID);

    if (sponsorIndex == -1 || contentState.sponsorTimes[sponsorIndex].source !== SponsorSourceType.Server)
        return Promise.resolve(undefined);

    const sponsorSkipped = getContentApp().commands.execute("skip/getSponsorSkipped", undefined) as boolean[];
    if ((type === 0 && sponsorSkipped[sponsorIndex]) || (type === 1 && !sponsorSkipped[sponsorIndex])) {
        let factor = 1;
        if (type == 0) {
            factor = -1;

            sponsorSkipped[sponsorIndex] = false;
        }

        Config.config.minutesSaved =
            Config.config.minutesSaved +
            (factor * (contentState.sponsorTimes[sponsorIndex].segment[1] - contentState.sponsorTimes[sponsorIndex].segment[0])) / 60;

        Config.config.skipCount = Config.config.skipCount + factor;
    }

    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            {
                message: "submitVote",
                type: type,
                UUID: UUID,
                category: category,
            },
            (response) => {
                if (response.successType === 1) {
                    const segment = utils.getSponsorTimeFromUUID(contentState.sponsorTimes, UUID);
                    if (segment) {
                        let reason: "voteDown" | "voteUp" | "categoryVote" | null = null;
                        if (type === 0) {
                            segment.hidden = SponsorHideType.Downvoted;
                            reason = "voteDown";
                        } else if (category) {
                            segment.category = category;
                            reason = "categoryVote";
                        } else if (type === 1) {
                            segment.hidden = SponsorHideType.Visible;
                            reason = "voteUp";
                        }

                        if (!category && !Config.config.isVip) {
                            utils.addHiddenSegment(getVideoID(), segment.UUID, segment.hidden);
                        }

                        if (reason) {
                            emitSegmentUpdated(segment, reason, "segmentSubmission.voteAsync");
                        }
                    }
                }

                resolve(response);
            }
        );
    });
}

/**
 * Helper method for the submission notice to clear itself when it closes
 */
export function resetSponsorSubmissionNotice(callRef = true): void {
    const { submissionNotice } = getUIState();
    submissionNotice?.close(callRef);
    patchUIState({ submissionNotice: null });
}

export function closeSubmissionMenu(): void {
    const { submissionNotice } = getUIState();
    submissionNotice?.close();
    patchUIState({ submissionNotice: null });
}

export function openSubmissionMenu(): void {
    const { submissionNotice } = getUIState();
    if (submissionNotice !== null) {
        closeSubmissionMenu();
        return;
    }

    if (contentState.sponsorTimesSubmitting !== undefined && contentState.sponsorTimesSubmitting.length > 0) {
        patchUIState({
            submissionNotice: new SubmissionNotice(getSkipNoticeContentContainer, sendSubmitMessage),
        });
        document.addEventListener("keydown", seekFrameByKeyPressListener);
    }
}

export function previewRecentSegment(): void {
    if (contentState.sponsorTimesSubmitting !== undefined && contentState.sponsorTimesSubmitting.length > 0) {
        void getContentApp().commands.execute("skip/previewTime", {
            time: contentState.sponsorTimesSubmitting[contentState.sponsorTimesSubmitting.length - 1].segment[0] - defaultPreviewTime,
            unpause: true,
        });

        const { submissionNotice } = getUIState();
        if (submissionNotice) {
            submissionNotice.scrollToBottom();
        }
    }
}

export function submitSegments(): void {
    const { submissionNotice } = getUIState();
    if (contentState.sponsorTimesSubmitting !== undefined && contentState.sponsorTimesSubmitting.length > 0 && submissionNotice !== null) {
        submissionNotice.submit();
    }
}

export async function sendSubmitMessage(): Promise<boolean> {
    if (
        !contentState.previewedSegment &&
        !contentState.sponsorTimesSubmitting.every(
            (segment) =>
                [ActionType.Full, ActionType.Poi].includes(segment.actionType) ||
                segment.segment[1] >= getVideo()?.duration ||
                segment.segment[0] === 0
        )
    ) {
        showMessage(
            `${chrome.i18n.getMessage("previewSegmentRequired")} ${keybindToString(Config.config.previewKeybind)}`,
            "warning"
        );
        return false;
    }

    if (!getUIState().playerButtons.submit) {
        await updateVisibilityOfPlayerControlsButton();
    }

    const submitButtons = getUIState().playerButtons;
    submitButtons.submit.image.src = chrome.runtime.getURL("icons/PlayerUploadIconSponsorBlocker.svg");
    const stopAnimation = AnimationUtils.applyLoadingAnimation(submitButtons.submit.button, 1, () =>
        updateSegmentSubmitting()
    );

    let adjustedSegmentDuration = false;
    const normalizedSegments = contentState.sponsorTimesSubmitting.map((segment) => {
        const nextSegment = cloneSubmittingSegment(segment);
        if (nextSegment.segment[1] > getVideo().duration) {
            nextSegment.segment[1] = getVideo().duration;
            adjustedSegmentDuration = true;
        }

        return nextSegment;
    });

    if (adjustedSegmentDuration) {
        replaceSubmittingSegments(normalizedSegments, "segmentSubmission.sendSubmitMessage.normalizeDuration");
    }

    if (Config.config.minDuration > 0) {
        for (let i = 0; i < contentState.sponsorTimesSubmitting.length; i++) {
            const duration = contentState.sponsorTimesSubmitting[i].segment[1] - contentState.sponsorTimesSubmitting[i].segment[0];
            if (duration > 0 && duration < Config.config.minDuration) {
                const confirmShort =
                    chrome.i18n.getMessage("shortCheck") + "\n\n" + getSegmentsMessage(contentState.sponsorTimesSubmitting);

                if (!confirm(confirmShort)) return false;
            }
        }
    }

    const response = await asyncRequestToServer("POST", "/api/skipSegments", {
        videoID: getBvID(),
        cid: getCid(),
        userID: Config.config.userID,
        segments: contentState.sponsorTimesSubmitting,
        videoDuration: getVideo()?.duration,
        userAgent: `${chrome.runtime.id}/v${chrome.runtime.getManifest().version}`,
    });

    if (response.status === 200) {
        stopAnimation();

        const newSegments = contentState.sponsorTimesSubmitting.map(cloneSubmittingSegment);
        try {
            const receivedNewSegments = JSON.parse(response.responseText);
            if (receivedNewSegments?.length === newSegments.length) {
                for (let i = 0; i < receivedNewSegments.length; i++) {
                    newSegments[i].UUID = receivedNewSegments[i].UUID;
                    newSegments[i].source = SponsorSourceType.Server;
                }
            }
        } catch (e) { } // eslint-disable-line no-empty

        contentState.sponsorTimes = (contentState.sponsorTimes || []).concat(newSegments).sort((a, b) => a.segment[0] - b.segment[0]);

        Config.config.sponsorTimesContributed = Config.config.sponsorTimesContributed + newSegments.length;

        Config.config.submissionCountSinceCategories = Config.config.submissionCountSinceCategories + 1;

        clearSubmittingSegments("segmentSubmission.sendSubmitMessage.success");

        emitSegmentsLoaded("segmentSubmission.sendSubmitMessage.success");

        const fullVideoSegment = contentState.sponsorTimes.filter((time) => time.actionType === ActionType.Full)[0];
        if (fullVideoSegment) {
            waitFor(() => getUIState().categoryPill).then(() => {
                getUIState().categoryPill?.setSegment(fullVideoSegment);
            });
            getVideoLabel(getVideoID(), true);
        }

        return true;
    } else {
        submitButtons.submit.button.style.animation = "unset";
        submitButtons.submit.image.src = chrome.runtime.getURL("icons/PlayerUploadFailedIconSponsorBlocker.svg");

        if (
            response.status === 403 &&
            response.responseText.startsWith("Submission rejected due to a tip from a moderator.")
        ) {
            openWarningDialog();
        } else {
            showMessage(getErrorMessage(response.status, response.responseText), "warning");
        }
    }

    return false;
}

export function getSegmentsMessage(sponsorTimes: SponsorTime[]): string {
    let sponsorTimesMessage = "";

    for (let i = 0; i < sponsorTimes.length; i++) {
        for (let s = 0; s < sponsorTimes[i].segment.length; s++) {
            let timeMessage = getFormattedTime(sponsorTimes[i].segment[s]);
            if (s == 1) {
                timeMessage = " " + chrome.i18n.getMessage("to") + " " + timeMessage;
            } else if (i > 0) {
                timeMessage = ", " + timeMessage;
            }

            sponsorTimesMessage += timeMessage;
        }
    }

    return sponsorTimesMessage;
}

function getSubmittingSegmentsWithPreloaded(baseSegments: SponsorTime[]): { segments: SponsorTime[]; pushed: boolean } {
    if (loadedPreloadedSegment) {
        return {
            segments: baseSegments.map(cloneSubmittingSegment),
            pushed: false,
        };
    }

    loadedPreloadedSegment = true;
    const hashParams = getHashParams();

    let pushed = false;
    const nextSegments = baseSegments.map(cloneSubmittingSegment);
    const segments = hashParams.segments;
    if (Array.isArray(segments)) {
        for (const segment of segments) {
            if (Array.isArray(segment.segment)) {
                if (
                    !nextSegments.some(
                        (s) => s.segment[0] === segment.segment[0] && s.segment[1] === segment.segment[1]
                    )
                ) {
                    nextSegments.push({
                        cid: getCid(),
                        segment: segment.segment,
                        UUID: generateUserID() as SegmentUUID,
                        category: segment.category ? segment.category : Config.config.defaultCategory,
                        actionType: segment.actionType ? segment.actionType : ActionType.Skip,
                        source: SponsorSourceType.Local,
                    });

                    pushed = true;
                }
            }
        }
    }

    return {
        segments: nextSegments,
        pushed,
    };
}

export function checkForPreloadedSegment(): void {
    const preloaded = getSubmittingSegmentsWithPreloaded(contentState.sponsorTimesSubmitting);

    if (preloaded.pushed) {
        replaceSubmittingSegments(preloaded.segments, "segmentSubmission.checkForPreloadedSegment");
    }
}
