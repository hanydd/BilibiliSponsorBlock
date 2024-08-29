import Config from "./config";

import { Message, VoteResponse } from "./messageTypes";
import { MessageHandler, MessageListener } from "./popup/PopupMessageHandler";
import { ActionType, SegmentUUID, SponsorHideType, SponsorTime } from "./types";
import { AnimationUtils } from "./utils/animationUtils";
import { shortCategoryName } from "./utils/categoryUtils";
import { getErrorMessage, getFormattedTime } from "./utils/formating";

//make this a function to allow this to run on the content page
export async function runThePopup(messageListener?: MessageListener): Promise<void> {
    const messageHandler = new MessageHandler(messageListener);

    type PageElements = { [key: string]: HTMLElement };

    //saves which detail elemts are opened, by saving the uuids
    const openedUUIDs: SegmentUUID[] = [];

    const PageElements: PageElements = {};

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

    function copyToClipboard(text: string): void {
        if (window === window.top) {
            window.navigator.clipboard.writeText(text);
        } else {
            sendTabMessage({
                message: "copyToClipboard",
                text,
            });
        }
    }
}
