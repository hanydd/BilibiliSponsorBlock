import Config from "./config";

import { StorageChangesObject } from "./config/config";
import {
    IsInfoFoundMessageResponse,
    Message,
    MessageResponse,
    PopupMessage,
    SponsorStartResponse,
    VoteResponse,
} from "./messageTypes";
import { asyncRequestToServer, sendRequestToServer } from "./requests/requests";
import { ActionType, SegmentUUID, SponsorHideType, SponsorTime } from "./types";
import { AnimationUtils } from "./utils/animationUtils";
import { shortCategoryName } from "./utils/categoryUtils";
import { getErrorMessage, getFormattedHours, getFormattedTime } from "./utils/formating";
import { getHash } from "./utils/hash";

interface MessageListener {
    (request: Message, sender: unknown, sendResponse: (response: MessageResponse) => void): void;
}

export class MessageHandler {
    messageListener: MessageListener;

    constructor(messageListener?: MessageListener) {
        this.messageListener = messageListener;
    }

    sendMessage(id: number, request: Message, callback?) {
        if (this.messageListener) {
            this.messageListener(request, null, callback);
        } else if (chrome.tabs) {
            chrome.tabs.sendMessage(id, request, callback);
        } else {
            chrome.runtime.sendMessage({ message: "tabs", data: request }, callback);
        }
    }

    query(config, callback) {
        if (this.messageListener || !chrome.tabs) {
            // Send back dummy info
            callback([
                {
                    url: document.URL,
                    id: -1,
                },
            ]);
        } else {
            chrome.tabs.query(config, callback);
        }
    }
}

//make this a function to allow this to run on the content page
export async function runThePopup(messageListener?: MessageListener): Promise<void> {
    const messageHandler = new MessageHandler(messageListener);

    type InputPageElements = {
        whitelistToggle?: HTMLInputElement;
        toggleSwitch?: HTMLInputElement;
        usernameInput?: HTMLInputElement;
    };
    type PageElements = { [key: string]: HTMLElement } & InputPageElements;

    let stopLoadingAnimation = null;
    // For loading video info from the page
    let loadRetryCount = 0;

    //the start and end time pairs (2d)
    let sponsorTimes: SponsorTime[] = [];
    let downloadedTimes: SponsorTime[] = [];

    //current video ID of this tab
    let currentVideoID = null;

    //saves which detail elemts are opened, by saving the uuids
    const openedUUIDs: SegmentUUID[] = [];

    const PageElements: PageElements = {};

    [
        "sbPopupLogo",
        "sbYourWorkBox",
        "videoInfo",
        "sbFooter",
        "sponsorBlockPopupBody",
        "sponsorblockPopup",
        "sponsorStart",
        // Top toggles
        "whitelistChannel",
        "unwhitelistChannel",
        "whitelistToggle",
        "whitelistForceCheck",
        "disableSkipping",
        "enableSkipping",
        "toggleSwitch",
        // Options
        "helpButton",
        // More controls
        "submitTimes",
        "sponsorTimesContributionsContainer",
        "sponsorTimesContributionsDisplay",
        "sponsorTimesViewsContainer",
        "sponsorTimesViewsDisplay",
        "sponsorTimesViewsDisplayEndWord",
        "sponsorTimesOthersTimeSavedDisplay",
        "sponsorTimesOthersTimeSavedEndWord",
        // Username
        "setUsernameContainer",
        "setUsernameButton",
        "setUsernameStatus",
        "setUsernameStatus",
        "setUsername",
        "usernameInput",
        "usernameValue",
        "submitUsername",
        // More
        "submissionHint",
        "mainControls",
        "loadingIndicator",
        "videoFound",
        "sponsorMessageTimes",
        //"downloadedSponsorMessageTimes",
        "refreshSegmentsButton",
        "whitelistButton",
        "sbDonate",
        "sponsorTimesDonateContainer",
        "sbConsiderDonateLink",
        "sbCloseDonate",
        "sbBetaServerWarning",
        "issueReporterImportExport",
    ].forEach((id) => (PageElements[id] = document.getElementById(id)));

    PageElements.sponsorStart.addEventListener("click", sendSponsorStartMessage);
    PageElements.toggleSwitch.addEventListener("change", function () {
        toggleSkipping(!this.checked);
    });
    // PageElements.submitTimes.addEventListener("click", submitTimes);
    PageElements.setUsernameButton.addEventListener("click", setUsernameButton);
    PageElements.usernameValue.addEventListener("click", setUsernameButton);
    PageElements.submitUsername.addEventListener("click", submitUsername);


    //show proper disable skipping button
    const disableSkipping = Config.config.disableSkipping;
    if (disableSkipping != undefined && disableSkipping) {
        PageElements.disableSkipping.style.display = "none";
        PageElements.enableSkipping.style.display = "unset";
        PageElements.toggleSwitch.checked = false;
    }

    asyncRequestToServer("GET", "/api/userInfo", {
        publicUserID: await getHash(Config.config.userID),
        values: ["userName", "viewCount", "minutesSaved", "vip", "permissions", "segmentCount"],
    }).then((res) => {
        if (res.status === 200) {
            const userInfo = JSON.parse(res.responseText);
            PageElements.usernameValue.innerText = userInfo.userName;

            const viewCount = userInfo.viewCount;
            if (viewCount != 0) {
                if (viewCount > 1) {
                    PageElements.sponsorTimesViewsDisplayEndWord.innerText = chrome.i18n.getMessage("Segments");
                } else {
                    PageElements.sponsorTimesViewsDisplayEndWord.innerText = chrome.i18n.getMessage("Segment");
                }
                PageElements.sponsorTimesViewsDisplay.innerText = viewCount.toLocaleString();
                PageElements.sponsorTimesViewsContainer.style.display = "block";
            }

            const minutesSaved = userInfo.minutesSaved;
            if (minutesSaved != 0) {
                if (minutesSaved != 1) {
                    PageElements.sponsorTimesOthersTimeSavedEndWord.innerText = chrome.i18n.getMessage("minsLower");
                } else {
                    PageElements.sponsorTimesOthersTimeSavedEndWord.innerText = chrome.i18n.getMessage("minLower");
                }
                PageElements.sponsorTimesOthersTimeSavedDisplay.innerText = getFormattedHours(minutesSaved);
            }

            //get the amount of times this user has contributed and display it to thank them
            PageElements.sponsorTimesContributionsDisplay.innerText = Math.max(
                Config.config.sponsorTimesContributed ?? 0,
                userInfo.segmentCount
            ).toLocaleString();
            PageElements.sponsorTimesContributionsContainer.classList.remove("hidden");

            PageElements.sponsorTimesOthersTimeSavedEndWord.innerText = chrome.i18n.getMessage("minsLower");

            Config.config.isVip = userInfo.vip;
            Config.config.permissions = userInfo.permissions;
        }
    });

    // Must be delayed so it only happens once loaded
    setTimeout(() => PageElements.sponsorblockPopup.classList.remove("preload"), 250);

    async function sendSponsorStartMessage() {
        //the content script will get the message if a Bilibili page is open
        const response = (await sendTabMessageAsync({
            from: "popup",
            message: "sponsorStart",
        })) as SponsorStartResponse;
        startSponsorCallback(response);

        // Perform a second update after the config changes take effect as a workaround for a race condition
        const removeListener = (listener: typeof lateUpdate) => {
            const index = Config.configSyncListeners.indexOf(listener);
            if (index !== -1) Config.configSyncListeners.splice(index, 1);
        };

        const lateUpdate = () => {
            startSponsorCallback(response);
            removeListener(lateUpdate);
        };

        Config.configSyncListeners.push(lateUpdate);

        // Remove the listener after 200ms in case the changes were propagated by the time we got the response
        setTimeout(() => removeListener(lateUpdate), 200);
    }

    function startSponsorCallback(response: SponsorStartResponse) {
        // Only update the segments after a segment was created
        if (!response.creatingSegment) {
            sponsorTimes = Config.local.unsubmittedSegments[currentVideoID] || [];
        }

        // Update the UI
        updateSegmentEditingUI();
    }

    //display the video times from the array at the top, in a different section
    function displayDownloadedSponsorTimes(sponsorTimes: SponsorTime[], time: number) {
        PageElements.issueReporterTabs.classList.add("hidden");

        // Sort list by start time
        const downloadedTimes = sponsorTimes
            .sort((a, b) => a.segment[1] - b.segment[1])
            .sort((a, b) => a.segment[0] - b.segment[0]);

        //add them as buttons to the issue reporting container
        const container = document.getElementById("issueReporterTimeButtons");
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        if (downloadedTimes.length > 0) {
            PageElements.exportSegmentsButton.classList.remove("hidden");
        } else {
            PageElements.exportSegmentsButton.classList.add("hidden");
        }

        const isVip = Config.config.isVip;
        for (let i = 0; i < downloadedTimes.length; i++) {
            const UUID = downloadedTimes[i].UUID;
            const locked = downloadedTimes[i].locked;
            const category = downloadedTimes[i].category;
            const actionType = downloadedTimes[i].actionType;

            const segmentSummary = document.createElement("summary");
            segmentSummary.classList.add("segmentSummary");
            if (time >= downloadedTimes[i].segment[0]) {
                if (time < downloadedTimes[i].segment[1]) {
                    segmentSummary.classList.add("segmentActive");
                } else {
                    segmentSummary.classList.add("segmentPassed");
                }
            }

            const categoryColorCircle = document.createElement("span");
            categoryColorCircle.id = "sponsorTimesCategoryColorCircle" + UUID;
            categoryColorCircle.style.backgroundColor = Config.config.barTypes[category]?.color;
            categoryColorCircle.classList.add("dot");
            categoryColorCircle.classList.add("sponsorTimesCategoryColorCircle");

            let extraInfo = "";
            if (downloadedTimes[i].hidden === SponsorHideType.Downvoted) {
                //this one is downvoted
                extraInfo = " (" + chrome.i18n.getMessage("hiddenDueToDownvote") + ")";
            } else if (downloadedTimes[i].hidden === SponsorHideType.MinimumDuration) {
                //this one is too short
                extraInfo = " (" + chrome.i18n.getMessage("hiddenDueToDuration") + ")";
            } else if (downloadedTimes[i].hidden === SponsorHideType.Hidden) {
                extraInfo = " (" + chrome.i18n.getMessage("manuallyHidden") + ")";
            }

            const name = downloadedTimes[i].description || shortCategoryName(category);
            const textNode = document.createTextNode(name + extraInfo);
            const segmentTimeFromToNode = document.createElement("div");
            if (downloadedTimes[i].actionType === ActionType.Full) {
                segmentTimeFromToNode.innerText = chrome.i18n.getMessage("full");
            } else {
                segmentTimeFromToNode.innerText =
                    getFormattedTime(downloadedTimes[i].segment[0], true) +
                    (actionType !== ActionType.Poi
                        ? " " +
                          chrome.i18n.getMessage("to") +
                          " " +
                          getFormattedTime(downloadedTimes[i].segment[1], true)
                        : "");
            }

            segmentTimeFromToNode.style.margin = "5px";

            // for inline-styling purposes
            const labelContainer = document.createElement("div");
            labelContainer.appendChild(categoryColorCircle);

            const span = document.createElement("span");
            span.className = "summaryLabel";
            span.appendChild(textNode);
            labelContainer.appendChild(span);

            segmentSummary.appendChild(labelContainer);
            segmentSummary.appendChild(segmentTimeFromToNode);

            const votingButtons = document.createElement("details");
            votingButtons.classList.add("votingButtons");
            votingButtons.id = "votingButtons" + UUID;
            votingButtons.setAttribute("data-uuid", UUID);
            votingButtons.addEventListener("toggle", () => {
                if (votingButtons.open) {
                    openedUUIDs.push(UUID);
                } else {
                    const index = openedUUIDs.indexOf(UUID);
                    if (index !== -1) {
                        openedUUIDs.splice(openedUUIDs.indexOf(UUID), 1);
                    }
                }
            });
            votingButtons.open = openedUUIDs.some((u) => u === UUID);

            //thumbs up and down buttons
            const voteButtonsContainer = document.createElement("div");
            voteButtonsContainer.id = "sponsorTimesVoteButtonsContainer" + UUID;
            voteButtonsContainer.classList.add("sbVoteButtonsContainer");

            const upvoteButton = document.createElement("img");
            upvoteButton.id = "sponsorTimesUpvoteButtonsContainer" + UUID;
            upvoteButton.className = "voteButton";
            upvoteButton.title = chrome.i18n.getMessage("upvote");
            upvoteButton.src = chrome.runtime.getURL("icons/thumbs_up.svg");
            upvoteButton.addEventListener("click", () => vote(1, UUID));

            const downvoteButton = document.createElement("img");
            downvoteButton.id = "sponsorTimesDownvoteButtonsContainer" + UUID;
            downvoteButton.className = "voteButton";
            downvoteButton.title = chrome.i18n.getMessage("downvote");
            downvoteButton.src =
                locked && isVip
                    ? chrome.runtime.getURL("icons/thumbs_down_locked.svg")
                    : chrome.runtime.getURL("icons/thumbs_down.svg");
            downvoteButton.addEventListener("click", () => vote(0, UUID));

            const uuidButton = document.createElement("img");
            uuidButton.id = "sponsorTimesCopyUUIDButtonContainer" + UUID;
            uuidButton.className = "voteButton";
            uuidButton.src = chrome.runtime.getURL("icons/clipboard.svg");
            uuidButton.title = chrome.i18n.getMessage("copySegmentID");
            uuidButton.addEventListener("click", () => {
                copyToClipboard(UUID);
                const stopAnimation = AnimationUtils.applyLoadingAnimation(uuidButton, 0.3);
                stopAnimation();
            });

            const hideButton = document.createElement("img");
            hideButton.id = "sponsorTimesCopyUUIDButtonContainer" + UUID;
            hideButton.className = "voteButton";
            hideButton.title = chrome.i18n.getMessage("hideSegment");
            if (downloadedTimes[i].hidden === SponsorHideType.Hidden) {
                hideButton.src = chrome.runtime.getURL("icons/not_visible.svg");
            } else {
                hideButton.src = chrome.runtime.getURL("icons/visible.svg");
            }
            hideButton.addEventListener("click", () => {
                const stopAnimation = AnimationUtils.applyLoadingAnimation(hideButton, 0.4);
                stopAnimation();

                if (downloadedTimes[i].hidden === SponsorHideType.Hidden) {
                    hideButton.src = chrome.runtime.getURL("icons/visible.svg");
                    downloadedTimes[i].hidden = SponsorHideType.Visible;
                } else {
                    hideButton.src = chrome.runtime.getURL("icons/not_visible.svg");
                    downloadedTimes[i].hidden = SponsorHideType.Hidden;
                }

                sendTabMessage({
                    message: "hideSegment",
                    type: downloadedTimes[i].hidden,
                    UUID: UUID,
                });
            });

            const skipButton = document.createElement("img");
            skipButton.id = "sponsorTimesSkipButtonContainer" + UUID;
            skipButton.className = "voteButton";
            skipButton.src = chrome.runtime.getURL("icons/skip.svg");
            skipButton.title = chrome.i18n.getMessage("skipSegment");
            skipButton.addEventListener("click", () => skipSegment(actionType, UUID, skipButton));
            votingButtons.addEventListener("dblclick", () => skipSegment(actionType, UUID));
            votingButtons.addEventListener("dblclick", () => skipSegment(actionType, UUID));
            votingButtons.addEventListener("mouseenter", () => selectSegment(UUID));

            //add thumbs up, thumbs down and uuid copy buttons to the container
            voteButtonsContainer.appendChild(upvoteButton);
            voteButtonsContainer.appendChild(downvoteButton);
            voteButtonsContainer.appendChild(uuidButton);
            if (
                downloadedTimes[i].actionType === ActionType.Skip ||
                downloadedTimes[i].actionType === ActionType.Mute ||
                (downloadedTimes[i].actionType === ActionType.Poi &&
                    [SponsorHideType.Visible, SponsorHideType.Hidden].includes(downloadedTimes[i].hidden))
            ) {
                voteButtonsContainer.appendChild(hideButton);
            }
            if (downloadedTimes[i].actionType !== ActionType.Full) {
                voteButtonsContainer.appendChild(skipButton);
            }

            // Will contain request status
            const voteStatusContainer = document.createElement("div");
            voteStatusContainer.id = "sponsorTimesVoteStatusContainer" + UUID;
            voteStatusContainer.classList.add("sponsorTimesVoteStatusContainer");
            voteStatusContainer.style.display = "none";

            const thanksForVotingText = document.createElement("div");
            thanksForVotingText.id = "sponsorTimesThanksForVotingText" + UUID;
            thanksForVotingText.classList.add("sponsorTimesThanksForVotingText");
            voteStatusContainer.appendChild(thanksForVotingText);

            votingButtons.append(segmentSummary);
            votingButtons.append(voteButtonsContainer);
            votingButtons.append(voteStatusContainer);

            container.appendChild(votingButtons);
        }

        container.addEventListener("mouseleave", () => selectSegment(null));
    }

    /** Updates any UI related to segment editing and submission according to the current state. */
    function updateSegmentEditingUI() {
        // PageElements.sponsorStart.innerText = chrome.i18n.getMessage(
        //     isCreatingSegment() ? "sponsorEnd" : "sponsorStart"
        // );
        // PageElements.submitTimes.style.display = sponsorTimes && sponsorTimes.length > 0 ? "unset" : "none";
        // PageElements.submissionHint.style.display = sponsorTimes && sponsorTimes.length > 0 ? "unset" : "none";
    }

    function sendTabMessage(data: Message, callback?) {
        messageHandler.query(
            {
                active: true,
                currentWindow: true,
            },
            (tabs) => {
                messageHandler.sendMessage(tabs[0].id, data, callback);
            }
        );
    }

    function sendTabMessageAsync(data: Message): Promise<unknown> {
        return new Promise((resolve) => sendTabMessage(data, (response) => resolve(response)));
    }

    //make the options username setting option visible
    function setUsernameButton() {
        PageElements.usernameInput.value = PageElements.usernameValue.innerText;

        PageElements.submitUsername.style.display = "unset";
        PageElements.usernameInput.style.display = "unset";

        PageElements.setUsernameContainer.style.display = "none";
        PageElements.setUsername.style.display = "flex";
        PageElements.setUsername.classList.add("SBExpanded");

        PageElements.setUsernameStatus.style.display = "none";

        PageElements.sponsorTimesContributionsContainer.classList.add("hidden");
    }

    //submit the new username
    function submitUsername() {
        //add loading indicator
        PageElements.setUsernameStatus.style.display = "unset";
        PageElements.setUsernameStatus.innerText = chrome.i18n.getMessage("Loading");

        sendRequestToServer(
            "POST",
            "/api/setUsername?userID=" + Config.config.userID + "&username=" + PageElements.usernameInput.value,
            function (response) {
                if (response.status == 200) {
                    //submitted
                    PageElements.submitUsername.style.display = "none";
                    PageElements.usernameInput.style.display = "none";

                    PageElements.setUsernameContainer.style.removeProperty("display");
                    PageElements.setUsername.classList.remove("SBExpanded");
                    PageElements.usernameValue.innerText = PageElements.usernameInput.value;

                    PageElements.setUsernameStatus.style.display = "none";

                    PageElements.sponsorTimesContributionsContainer.classList.remove("hidden");
                } else {
                    PageElements.setUsernameStatus.innerText = getErrorMessage(response.status, response.responseText);
                }
            }
        );

        PageElements.setUsernameContainer.style.display = "none";
        PageElements.setUsername.style.display = "unset";
    }

    function addVoteMessage(message, UUID) {
        const voteButtonsContainer = document.getElementById("sponsorTimesVoteButtonsContainer" + UUID);
        voteButtonsContainer.style.display = "none";

        const voteStatusContainer = document.getElementById("sponsorTimesVoteStatusContainer" + UUID);
        voteStatusContainer.style.removeProperty("display");

        const thanksForVotingText = document.getElementById("sponsorTimesThanksForVotingText" + UUID);
        thanksForVotingText.innerText = message;
    }

    function removeVoteMessage(UUID) {
        const voteButtonsContainer = document.getElementById("sponsorTimesVoteButtonsContainer" + UUID);
        voteButtonsContainer.style.display = "block";

        const voteStatusContainer = document.getElementById("sponsorTimesVoteStatusContainer" + UUID);
        voteStatusContainer.style.display = "none";

        const thanksForVotingText = document.getElementById("sponsorTimesThanksForVotingText" + UUID);
        thanksForVotingText.removeAttribute("innerText");
    }

    async function vote(type, UUID) {
        //add loading info
        addVoteMessage(chrome.i18n.getMessage("Loading"), UUID);
        const response = (await sendTabMessageAsync({
            message: "submitVote",
            type: type,
            UUID: UUID,
        })) as VoteResponse;

        if (response != undefined) {
            //see if it was a success or failure
            if (response.successType == 1 || (response.successType == -1 && response.statusCode == 429)) {
                //success (treat rate limits as a success)
                addVoteMessage(chrome.i18n.getMessage("voted"), UUID);
            } else if (response.successType == -1) {
                addVoteMessage(getErrorMessage(response.statusCode, response.responseText), UUID);
            }
            setTimeout(() => removeVoteMessage(UUID), 1500);
        }
    }

    function skipSegment(actionType: ActionType, UUID: SegmentUUID, element?: HTMLElement): void {
        sendTabMessage({
            message: "reskip",
            UUID: UUID,
        });

        if (element) {
            const stopAnimation = AnimationUtils.applyLoadingAnimation(element, 0.3);
            stopAnimation();
        }
    }

    function selectSegment(UUID: SegmentUUID | null): void {
        sendTabMessage({
            message: "selectSegment",
            UUID: UUID,
        });
    }

    /**
     * Should skipping be disabled (visuals stay)
     */
    function toggleSkipping(disabled) {
        Config.config.disableSkipping = disabled;

        let hiddenButton = PageElements.disableSkipping;
        let shownButton = PageElements.enableSkipping;

        if (!disabled) {
            hiddenButton = PageElements.enableSkipping;
            shownButton = PageElements.disableSkipping;
        }

        shownButton.style.display = "unset";
        hiddenButton.style.display = "none";
    }
}
