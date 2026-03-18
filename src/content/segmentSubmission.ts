import SkipNoticeComponent from "../components/SkipNoticeComponent";
import Config from "../config";
import { keybindToString } from "../config/config";
import { ContentContainer } from "../ContentContainerTypes";
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
    SkipToTimeParams,
    SponsorHideType,
    SponsorSourceType,
    SponsorTime,
    YTID,
} from "../types";
import Utils from "../utils";
import { waitFor } from "../utils/";
import { AnimationUtils } from "../utils/animationUtils";
import { defaultPreviewTime } from "../utils/constants";
import { durationEquals } from "../utils/duraionUtils";
import { getErrorMessage, getFormattedTime } from "../utils/formating";
import { getHash, getVideoIDHash, HashedValue } from "../utils/hash";
import { getCidMapFromWindow } from "../utils/injectedScriptMessageUtils";
import { getHashParams } from "../utils/pageUtils";
import { generateUserID } from "../utils/setup";
import { getBvID, getCid, getVideo, getVideoID, waitForVideo } from "../utils/video";
import { parseBvidAndCidFromVideoId } from "../utils/videoIdUtils";
import { openWarningDialog } from "../utils/warnings";
import { getLastPreviewBarUpdate } from "./previewBarManager";
import { getSponsorSkipped } from "./skipScheduler";
import { contentState } from "./state";

const utils = new Utils();

// --- Module-private state (formerly on contentState) ---
let lookupWaiting = false;
let loadedPreloadedSegment = false;
let playerButtons: Record<string, { button: HTMLButtonElement; image: HTMLImageElement }> = {};
let descriptionPill: DescriptionPortPill = null;
let submissionNotice: SubmissionNotice = null;
let popupInitialised = false;
let skipButtonControlBar: SkipButtonControlBar = null;
let categoryPill: CategoryPill = null;

export function getSkipButtonControlBar() { return skipButtonControlBar; }
export function getCategoryPill() { return categoryPill; }
export function getPopupInitialised() { return popupInitialised; }
export function setPopupInitialised(v: boolean) { popupInitialised = v; }
export function getSubmissionNotice() { return submissionNotice; }

export function resetSubmissionState(): void {
    loadedPreloadedSegment = false;
    lookupWaiting = false;
    popupInitialised = false;
    if (submissionNotice) {
        submissionNotice.close();
        submissionNotice = null;
    }
    playerButtons = {};
    descriptionPill = null;
    skipButtonControlBar = null;
    categoryPill = null;
}

export interface SegmentSubmissionDeps {
    skipToTime: (params: SkipToTimeParams) => void;
    startSponsorSchedule: (seekTime?: boolean, seekToTime?: number) => void;
    previewTime: (time: number, showNotice?: boolean) => void;
    startSkipScheduleCheckingForStartSponsors: () => void;
    updatePreviewBar: () => void;
    selectSegment: (UUID: SegmentUUID) => void;
    seekFrameByKeyPressListener: (event: KeyboardEvent) => void;
    playerButton: PlayerButton;
    skipNoticeContentContainer: ContentContainer;
}

let deps: SegmentSubmissionDeps;

export function initSegmentSubmission(d: SegmentSubmissionDeps): void {
    deps = d;
}

export function setupSkipButtonControlBar(): void {
    if (!skipButtonControlBar) {
        skipButtonControlBar = new SkipButtonControlBar({
            skip: (segment) =>
                deps.skipToTime({
                    v: getVideo(),
                    skipTime: segment.segment,
                    skippingSegments: [segment],
                    openNotice: true,
                    forceAutoSkip: true,
                }),
            selectSegment: deps.selectSegment,
        });
    }

    skipButtonControlBar.attachToPage();
}

export function setupCategoryPill(): void {
    if (!categoryPill) {
        categoryPill = new CategoryPill();
    }

    categoryPill.attachToPage(voteAsync);
}

export function setupDescriptionPill(): void {
    if (!descriptionPill) {
        descriptionPill = new DescriptionPortPill(
            getPortVideo,
            submitPortVideo,
            portVideoVote,
            updateSegments,
            sponsorsLookup
        );
    }
    descriptionPill.setupDescription(getVideoID());
}

export async function updatePortVideoElements(newPortVideo: PortVideo): Promise<void> {
    contentState.portVideo = newPortVideo;
    waitFor(() => descriptionPill).then(() => descriptionPill.setPortVideoData(newPortVideo));

    chrome.runtime.sendMessage({
        message: "infoUpdated",
        found: contentState.sponsorDataFound,
        status: contentState.lastResponseStatus,
        sponsorTimes: contentState.sponsorTimes,
        portVideo: newPortVideo,
        time: getVideo()?.currentTime ?? 0,
    });
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

    const extraRequestData: Record<string, unknown> = {};
    const hashParams = getHashParams();
    if (hashParams.requiredSegment) extraRequestData.requiredSegment = hashParams.requiredSegment;

    const hashPrefix = (await getVideoIDHash(videoID)).slice(0, 4) as BVID & HashedValue;
    const segmentResponse = await getSegmentsByVideoID(videoID, extraRequestData, ignoreServerCache);

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

            deps.startSkipScheduleCheckingForStartSponsors();

            if (
                forceUpdatePreviewBar ||
                getLastPreviewBarUpdate() == getVideoID() ||
                (getLastPreviewBarUpdate() == null && !isNaN(getVideo().duration))
            ) {
                deps.updatePreviewBar();
            }
        }
    }

    chrome.runtime.sendMessage({
        message: "infoUpdated",
        found: contentState.sponsorDataFound,
        status: contentState.lastResponseStatus,
        sponsorTimes: contentState.sponsorTimes,
        portVideo: contentState.portVideo,
        time: getVideo()?.currentTime ?? 0,
    });

    if (Config.config.isVip) {
        lockedCategoriesLookup();
    }
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
            }
        } catch (e) { } //eslint-disable-line no-empty
    }
}

/** Creates any missing buttons on the player and updates their visiblity. */
export async function updateVisibilityOfPlayerControlsButton(): Promise<void> {
    if (!getVideoID()) return;

    playerButtons = await deps.playerButton.createButtons();

    updateSegmentSubmitting();
}

/** Updates the visibility of buttons on the player related to creating segments. */
export function updateSegmentSubmitting(): void {
    if (!getVideoID()) return;
    deps.playerButton.updateSegmentSubmitting(contentState.sponsorTimesSubmitting);
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
    if (!isSegmentCreationInProgress()) {
        contentState.sponsorTimesSubmitting.push({
            cid: getCid(),
            segment: [roundedTime],
            UUID: generateUserID() as SegmentUUID,
            category: Config.config.defaultCategory,
            actionType: ActionType.Skip,
            source: SponsorSourceType.Local,
        });
    } else {
        const existingSegment = getIncompleteSegment();
        const existingTime = existingSegment.segment[0];
        const currentTime = roundedTime;

        existingSegment.segment = [Math.min(existingTime, currentTime), Math.max(existingTime, currentTime)];
    }

    Config.local.unsubmittedSegments[getVideoID()] = contentState.sponsorTimesSubmitting;
    Config.forceLocalUpdate("unsubmittedSegments");

    sponsorsLookup(true, true);

    updateSegmentSubmitting();
    updateSponsorTimesSubmitting(false);

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
            contentState.sponsorTimesSubmitting.pop();
            Config.local.unsubmittedSegments[getVideoID()] = contentState.sponsorTimesSubmitting;
        } else {
            resetSponsorSubmissionNotice();
            contentState.sponsorTimesSubmitting = [];
            delete Config.local.unsubmittedSegments[getVideoID()];
        }
        Config.forceLocalUpdate("unsubmittedSegments");
    }

    updateSegmentSubmitting();
    updateSponsorTimesSubmitting(false);
}

export function updateSponsorTimesSubmitting(getFromConfig = true): void {
    const segmentTimes = Config.local.unsubmittedSegments[getVideoID()];

    if (getFromConfig && segmentTimes != undefined) {
        contentState.sponsorTimesSubmitting = [];

        for (const segmentTime of segmentTimes) {
            contentState.sponsorTimesSubmitting.push({
                cid: getCid(),
                segment: segmentTime.segment,
                UUID: segmentTime.UUID,
                category: segmentTime.category,
                actionType: segmentTime.actionType,
                source: segmentTime.source,
            });
        }

        if (contentState.sponsorTimesSubmitting.length > 0) {
            contentState.previewedSegment = true;
        }
    }

    deps.updatePreviewBar();

    if (getVideo() !== null) deps.startSponsorSchedule();

    if (submissionNotice !== null) {
        submissionNotice.update();
    }

    checkForPreloadedSegment();
}

export function openInfoMenu(): void {
    if (document.getElementById("sponsorBlockPopupContainer") != null) {
        return;
    }

    popupInitialised = false;

    const popup = document.createElement("div");
    popup.id = "sponsorBlockPopupContainer";

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

    popup.remove();

    window.dispatchEvent(new Event("closePopupMenu"));
}

export function clearSponsorTimes(): void {
    const currentVideoID = getVideoID();

    const sponsorTimes = Config.local.unsubmittedSegments[currentVideoID];

    if (sponsorTimes != undefined && sponsorTimes.length > 0) {
        resetSponsorSubmissionNotice();

        delete Config.local.unsubmittedSegments[currentVideoID];
        Config.forceLocalUpdate("unsubmittedSegments");

        contentState.sponsorTimesSubmitting = [];

        deps.updatePreviewBar();
        updateSegmentSubmitting();
    }
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
                    openWarningDialog(deps.skipNoticeContentContainer);
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

    if ((type === 0 && getSponsorSkipped()[sponsorIndex]) || (type === 1 && !getSponsorSkipped()[sponsorIndex])) {
        let factor = 1;
        if (type == 0) {
            factor = -1;

            getSponsorSkipped()[sponsorIndex] = false;
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
                        if (type === 0) {
                            segment.hidden = SponsorHideType.Downvoted;
                        } else if (category) {
                            segment.category = category;
                        } else if (type === 1) {
                            segment.hidden = SponsorHideType.Visible;
                        }

                        if (!category && !Config.config.isVip) {
                            utils.addHiddenSegment(getVideoID(), segment.UUID, segment.hidden);
                        }

                        deps.updatePreviewBar();
                    }
                }

                resolve(response);
            }
        );
    });
}

export function closeAllSkipNotices(): void {
    const notices = document.getElementsByClassName("sponsorSkipNotice");
    for (let i = 0; i < notices.length; i++) {
        notices[i].remove();
    }
}

export function dontShowNoticeAgain(): void {
    Config.config.dontShowNotice = true;
    closeAllSkipNotices();
}

/**
 * Helper method for the submission notice to clear itself when it closes
 */
export function resetSponsorSubmissionNotice(callRef = true): void {
    submissionNotice?.close(callRef);
    submissionNotice = null;
}

export function closeSubmissionMenu(): void {
    submissionNotice?.close();
    submissionNotice = null;
}

export function openSubmissionMenu(): void {
    if (submissionNotice !== null) {
        closeSubmissionMenu();
        return;
    }

    if (contentState.sponsorTimesSubmitting !== undefined && contentState.sponsorTimesSubmitting.length > 0) {
        submissionNotice = new SubmissionNotice(deps.skipNoticeContentContainer, sendSubmitMessage);
        document.addEventListener("keydown", deps.seekFrameByKeyPressListener);
    }
}

export function previewRecentSegment(): void {
    if (contentState.sponsorTimesSubmitting !== undefined && contentState.sponsorTimesSubmitting.length > 0) {
        deps.previewTime(contentState.sponsorTimesSubmitting[contentState.sponsorTimesSubmitting.length - 1].segment[0] - defaultPreviewTime);

        if (submissionNotice) {
            submissionNotice.scrollToBottom();
        }
    }
}

export function submitSegments(): void {
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

    playerButtons.submit.image.src = chrome.runtime.getURL("icons/PlayerUploadIconSponsorBlocker.svg");
    const stopAnimation = AnimationUtils.applyLoadingAnimation(playerButtons.submit.button, 1, () =>
        updateSegmentSubmitting()
    );

    for (let i = 0; i < contentState.sponsorTimesSubmitting.length; i++) {
        if (contentState.sponsorTimesSubmitting[i].segment[1] > getVideo().duration) {
            contentState.sponsorTimesSubmitting[i].segment[1] = getVideo().duration;
        }
    }

    Config.local.unsubmittedSegments[getVideoID()] = contentState.sponsorTimesSubmitting;
    Config.forceLocalUpdate("unsubmittedSegments");

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

        delete Config.local.unsubmittedSegments[getVideoID()];
        Config.forceLocalUpdate("unsubmittedSegments");

        const newSegments = contentState.sponsorTimesSubmitting;
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

        Config.config.sponsorTimesContributed = Config.config.sponsorTimesContributed + contentState.sponsorTimesSubmitting.length;

        Config.config.submissionCountSinceCategories = Config.config.submissionCountSinceCategories + 1;

        contentState.sponsorTimesSubmitting = [];

        deps.updatePreviewBar();

        const fullVideoSegment = contentState.sponsorTimes.filter((time) => time.actionType === ActionType.Full)[0];
        if (fullVideoSegment) {
            waitFor(() => categoryPill).then(() => {
                categoryPill?.setSegment(fullVideoSegment);
            });
            getVideoLabel(getVideoID(), true);
        }

        return true;
    } else {
        playerButtons.submit.button.style.animation = "unset";
        playerButtons.submit.image.src = chrome.runtime.getURL("icons/PlayerUploadFailedIconSponsorBlocker.svg");

        if (
            response.status === 403 &&
            response.responseText.startsWith("Submission rejected due to a tip from a moderator.")
        ) {
            openWarningDialog(deps.skipNoticeContentContainer);
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

export function checkForPreloadedSegment(): void {
    if (loadedPreloadedSegment) return;

    loadedPreloadedSegment = true;
    const hashParams = getHashParams();

    let pushed = false;
    const segments = hashParams.segments;
    if (Array.isArray(segments)) {
        for (const segment of segments) {
            if (Array.isArray(segment.segment)) {
                if (
                    !contentState.sponsorTimesSubmitting.some(
                        (s) => s.segment[0] === segment.segment[0] && s.segment[1] === s.segment[1]
                    )
                ) {
                    contentState.sponsorTimesSubmitting.push({
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

    if (pushed) {
        Config.local.unsubmittedSegments[getVideoID()] = contentState.sponsorTimesSubmitting;
        Config.forceLocalUpdate("unsubmittedSegments");
    }
}
