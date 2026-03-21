import Config from "../config";
import { StorageChangesObject } from "../config/config";
import { Message, MessageResponse, VoteResponse } from "../messageTypes";
import { checkPageForNewThumbnails } from "../thumbnail-utils/thumbnailManagement";
import {
    ActionType,
    Category,
    PortVideo,
    SegmentUUID,
    SponsorHideType,
    SponsorTime,
    YTID,
} from "../types";
import Utils from "../utils";
import { importTimes } from "../utils/exporter";
import { getBilibiliVideoID } from "../utils/parseVideoID";
import { checkVideoIDChange, getChannelIDInfo, getVideo, getVideoID } from "../utils/video";
import { getPopupInitialised, getSkipButtonControlBar, setPopupInitialised } from "./segmentSubmission";
import { contentState } from "./state";

export interface MessageHandlerDeps {
    startOrEndTimingNewSegment: () => void;
    isSegmentCreationInProgress: () => boolean;
    closeInfoMenu: () => void;
    openSubmissionMenu: () => void;
    videoIDChange: () => Promise<void>;
    selectSegment: (UUID: SegmentUUID) => void;
    vote: (type: number, UUID: SegmentUUID, category?: Category) => Promise<VoteResponse>;
    updatePreviewBar: () => void;
    updateSegmentSubmitting: () => void;
    updateSponsorTimesSubmitting: (getFromConfig?: boolean) => void;
    unskipSponsorTime: (segment: SponsorTime, unskipTime?: number, forceSeek?: boolean) => void;
    reskipSponsorTime: (segment: SponsorTime, forceSeek?: boolean) => void;
    sponsorsLookup: (keepOldSubmissions?: boolean, ignoreServerCache?: boolean, forceUpdatePreviewBar?: boolean) => void;
    submitPortVideo: (ytbID: YTID) => Promise<PortVideo>;
    portVideoVote: (UUID: string, vote: number) => void;
    updateSegments: (UUID: string) => void;
    updateVisibilityOfPlayerControlsButton: () => void;
    setCategoryColorCSSVariables: () => void;
    utils: Utils;
}

let deps: MessageHandlerDeps;

export function initMessageHandler(dependencies: MessageHandlerDeps): void {
    deps = dependencies;
}

export function setupMessageListener(): void {
    chrome.runtime.onMessage.addListener(messageListener);
    if (!Config.configSyncListeners.includes(contentConfigUpdateListener)) {
        Config.configSyncListeners.push(contentConfigUpdateListener);
    }
}

function messageListener(
    request: Message,
    sender: unknown,
    sendResponse: (response: MessageResponse) => void
): void | boolean {
    switch (request.message) {
        case "update":
            checkVideoIDChange();
            break;
        case "sponsorStart":
            deps.startOrEndTimingNewSegment();

            sendResponse({
                creatingSegment: deps.isSegmentCreationInProgress(),
            });

            break;
        case "isInfoFound":
            if (!contentState.lastResponseStatus) return;

            sendResponse({
                found: contentState.sponsorDataFound,
                status: contentState.lastResponseStatus,
                sponsorTimes: contentState.sponsorTimes,
                portVideo: contentState.portVideo,
                time: getVideo()?.currentTime ?? 0,
            });

            if (
                !request.updating &&
                getPopupInitialised() &&
                document.getElementById("sponsorBlockPopupContainer") != null
            ) {
                deps.closeInfoMenu();
            }

            setPopupInitialised(true);
            break;
        case "getVideoID":
            (async () => {
                let id = getVideoID();
                if (!id) {
                    id = await getBilibiliVideoID();
                    if (id) await deps.videoIDChange();
                }
                return {
                    videoID: id,
                };
            })()
                .then(sendResponse)
                .catch((e) => {
                    console.error("get video id failed: ", e);
                });
            return true;
        case "getChannelID":
            sendResponse({
                channelID: getChannelIDInfo().id,
            });

            break;
        case "getChannelInfo":
            {
                const channelID = getChannelIDInfo().id;
                let channelName = chrome.i18n.getMessage("whitelistUnknownUploader") || "Unknown UP";

                const upNameElement = document.querySelector("a.up-name");
                if (upNameElement && upNameElement.textContent) {
                    channelName = upNameElement.textContent.trim();
                }

                sendResponse({
                    channelID,
                    channelName,
                });
            }
            break;
        case "isChannelWhitelisted":
            sendResponse({
                value: contentState.channelWhitelisted,
            });

            break;
        case "whitelistChange":
            contentState.channelWhitelisted = request.value;
            deps.sponsorsLookup();

            break;
        case "submitTimes":
            deps.openSubmissionMenu();
            break;
        case "refreshSegments":
            if (!getVideoID()) {
                checkVideoIDChange();
            }

            sendResponse({ hasVideo: getVideoID() != null });
            deps.sponsorsLookup(false, true);

            break;
        case "unskip":
            deps.unskipSponsorTime(
                contentState.sponsorTimes.find((segment) => segment.UUID === request.UUID),
                null,
                true
            );
            break;
        case "reskip":
            deps.reskipSponsorTime(
                contentState.sponsorTimes.find((segment) => segment.UUID === request.UUID),
                true
            );
            break;
        case "selectSegment":
            deps.selectSegment(request.UUID);
            break;
        case "submitVote":
            deps.vote(request.type, request.UUID).then(sendResponse);
            return true;
        case "hideSegment":
            deps.utils.getSponsorTimeFromUUID(contentState.sponsorTimes, request.UUID).hidden = request.type;
            deps.utils.addHiddenSegment(getVideoID(), request.UUID, request.type);
            deps.updatePreviewBar();

            if (
                getSkipButtonControlBar()?.isEnabled() &&
                contentState.sponsorTimesSubmitting.every(
                    (s) => s.hidden !== SponsorHideType.Visible || s.actionType !== ActionType.Poi
                )
            ) {
                getSkipButtonControlBar().disable();
            }
            break;
        case "closePopup":
            deps.closeInfoMenu();
            break;
        case "copyToClipboard":
            navigator.clipboard.writeText(request.text);
            break;
        case "importSegments": {
            const importedSegments = importTimes(request.data, getVideo().duration);
            let addedSegments = false;
            for (const segment of importedSegments) {
                if (
                    !contentState.sponsorTimesSubmitting.some(
                        (s) =>
                            Math.abs(s.segment[0] - segment.segment[0]) < 1 &&
                            Math.abs(s.segment[1] - segment.segment[1]) < 1
                    )
                ) {
                    contentState.sponsorTimesSubmitting.push(segment);
                    addedSegments = true;
                }
            }

            if (addedSegments) {
                Config.local.unsubmittedSegments[getVideoID()] = contentState.sponsorTimesSubmitting;
                Config.forceLocalUpdate("unsubmittedSegments");

                deps.updateSegmentSubmitting();
                deps.updateSponsorTimesSubmitting(false);
                deps.openSubmissionMenu();
            }

            sendResponse({
                importedSegments,
            });
            break;
        }
        case "keydown":
            (document.body || document).dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: request.key,
                    keyCode: request.keyCode,
                    code: request.code,
                    which: request.which,
                    shiftKey: request.shiftKey,
                    ctrlKey: request.ctrlKey,
                    altKey: request.altKey,
                    metaKey: request.metaKey,
                })
            );
            break;
        case "submitPortVideo":
            deps.submitPortVideo(request.ytbID);
            break;
        case "votePortVideo":
            deps.portVideoVote(request.UUID, request.vote);
            break;
        case "updatePortedSegments":
            deps.updateSegments(request.UUID);
            break;
    }

    sendResponse({});
}

function contentConfigUpdateListener(changes: StorageChangesObject) {
    for (const key in changes) {
        switch (key) {
            case "hideVideoPlayerControls":
            case "hideInfoButtonPlayerControls":
            case "hideDeleteButtonPlayerControls":
                deps.updateVisibilityOfPlayerControlsButton();
                break;
            case "categorySelections":
                deps.sponsorsLookup();
                break;
            case "barTypes":
                deps.setCategoryColorCSSVariables();
                break;
            case "fullVideoSegments":
            case "fullVideoLabelsOnThumbnails":
                checkPageForNewThumbnails();
                break;
        }
    }
}
