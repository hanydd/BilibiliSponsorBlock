import Config from "../config";
import { StorageChangesObject } from "../config/config";
import { Message, MessageResponse } from "../messageTypes";
import { checkPageForNewThumbnails } from "../thumbnail-utils/thumbnailManagement";
import Utils from "../utils";
import { importTimes } from "../utils/exporter";
import { getLogsSnapshot } from "../utils/logger";
import { getBilibiliVideoID } from "../utils/parseVideoID";
import { checkVideoIDChange, getChannelIDInfo, getVideo, getVideoID } from "../utils/video";
import { getContentApp } from "./app";
import { CONTENT_EVENTS } from "./app/events";
import { contentState, syncContentStateStore } from "./state";

const utils = new Utils();

export function setupMessageListener(): void {
    chrome.runtime.onMessage.addListener(handleContentMessage);
    if (!Config.configSyncListeners.includes(contentConfigUpdateListener)) {
        Config.configSyncListeners.push(contentConfigUpdateListener);
    }
}

export function handleContentMessage(
    request: Message,
    sender: unknown,
    sendResponse: (response: MessageResponse) => void
): void | boolean {
    const app = getContentApp();
    const uiState = app.ui.getState();
    switch (request.message) {
        case "update":
            checkVideoIDChange();
            break;
        case "sponsorStart":
            void app.commands.execute("segment/toggleCapture", undefined);

            sendResponse({
                creatingSegment: app.commands.execute("segment/isCreationInProgress", undefined) as boolean,
            });

            return;
        case "isInfoFound":
            if (!contentState.lastResponseStatus) return;

            sendResponse({
                found: contentState.sponsorDataFound,
                status: contentState.lastResponseStatus,
                sponsorTimes: contentState.sponsorTimes,
                backendInfo: contentState.backendInfo,
                portVideo: contentState.portVideo,
                time: getVideo()?.currentTime ?? 0,
            });

            if (
                !request.updating &&
                uiState.popupInitialised &&
                document.getElementById("sponsorBlockPopupContainer") != null
            ) {
                void app.commands.execute("popup/closeInfoMenu", undefined);
            }

            app.ui.patchState({ popupInitialised: true });
            return;
        case "getVideoID":
            (async () => {
                let id = getVideoID();
                if (!id) {
                    id = await getBilibiliVideoID();
                    if (id) {
                        await checkVideoIDChange();
                    }
                    id = getVideoID();
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

            return;
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
            return;
        case "isChannelWhitelisted":
            sendResponse({
                value: contentState.channelWhitelisted,
            });

            return;
        case "whitelistChange":
            contentState.channelWhitelisted = request.value;
            syncContentStateStore("messageHandler.whitelistChange");
            app.bus.emit(
                CONTENT_EVENTS.CHANNEL_WHITELIST_CHANGED,
                {
                    videoID: getVideoID(),
                    whitelisted: request.value,
                    reason: "popupToggle",
                },
                { source: "messageHandler.whitelistChange" }
            );

            break;
        case "submitTimes":
            void app.commands.execute("segment/openSubmissionMenu", undefined);
            break;
        case "refreshSegments":
            if (!getVideoID()) {
                checkVideoIDChange();
            }

            sendResponse({ hasVideo: getVideoID() != null });
            void app.commands.execute("segments/lookup", { keepOldSubmissions: false, ignoreServerCache: true });

            return;
        case "getLogs": {
            const logs = getLogsSnapshot();
            sendResponse({
                page: {
                    url: document.URL,
                    title: document.title,
                    hidden: document.hidden,
                    readyState: document.readyState,
                    capturedAt: new Date().toISOString(),
                },
                counts: {
                    debug: logs.debug.length,
                    warn: logs.warn.length,
                    lifecycle: logs.lifecycle.length,
                },
                lifecycleSummary: logs.lifecycleSummary,
                logs,
            });
            return;
        }
        case "unskip":
            void app.commands.execute("skip/unskip", {
                segment: contentState.sponsorTimes.find((segment) => segment.UUID === request.UUID),
                unskipTime: null,
                forceSeek: true,
            });
            break;
        case "reskip":
            void app.commands.execute("skip/reskip", {
                segment: contentState.sponsorTimes.find((segment) => segment.UUID === request.UUID),
                forceSeek: true,
            });
            break;
        case "selectSegment":
            void app.commands.execute("segments/select", { UUID: request.UUID });
            break;
        case "submitVote":
            {
                const backendId = (request as unknown as { backendId?: string }).backendId;
                Promise.resolve(
                    app.commands.execute("segment/vote", {
                        type: request.type,
                        UUID: request.UUID,
                        backendId,
                    } as unknown as { type: number; UUID: typeof request.UUID; backendId?: string })
                ).then(sendResponse);
            }
            return true;
        case "hideSegment":
            {
                const segment = utils.getSponsorTimeFromUUID(contentState.sponsorTimes, request.UUID);
                segment.hidden = request.type;
                utils.addHiddenSegment(getVideoID(), request.UUID, request.type);
                syncContentStateStore("messageHandler.hideSegment");
                app.bus.emit(
                    CONTENT_EVENTS.SEGMENT_UPDATED,
                    {
                        videoID: getVideoID(),
                        UUID: request.UUID,
                        segment,
                        reason: "popupHide",
                    },
                    { source: "messageHandler.hideSegment" }
                );
            }
            break;
        case "closePopup":
            void app.commands.execute("popup/closeInfoMenu", undefined);
            break;
        case "copyToClipboard":
            navigator.clipboard.writeText(request.text);
            break;
        case "importSegments": {
            const importedSegments = importTimes(request.data, getVideo().duration);
            void app.commands.execute("segments/import", { importedSegments });

            sendResponse({
                importedSegments,
            });
            return;
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
            void app.commands.execute("port/submitVideo", { ytbID: request.ytbID });
            break;
        case "votePortVideo":
            void app.commands.execute("port/voteVideo", { UUID: request.UUID, vote: request.vote });
            break;
        case "updatePortedSegments":
            void app.commands.execute("port/updateSegments", { UUID: request.UUID });
            break;
    }

    sendResponse({});
}

function contentConfigUpdateListener(changes: StorageChangesObject) {
    const app = getContentApp();
    app.bus.emit(CONTENT_EVENTS.CONFIG_CHANGED, { changes }, { source: "messageHandler.configSyncListener" });

    for (const key in changes) {
        switch (key) {
            case "hideVideoPlayerControls":
            case "hideInfoButtonPlayerControls":
            case "hideDeleteButtonPlayerControls":
                void app.commands.execute("ui/updatePlayerButtons", undefined);
                break;
            case "categorySelections":
                void app.commands.execute("segments/lookup", {});
                break;
            case "barTypes":
                void app.commands.execute("config/applyCategoryColors", undefined);
                break;
            case "fullVideoSegments":
            case "fullVideoLabelsOnThumbnails":
                checkPageForNewThumbnails();
                break;
        }
    }
}
