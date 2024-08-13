const bsbElements = [
    "#categoryPillParent",
    ".playerButton",
    ".sponsorThumbnailLabel",
    "#submissionNoticeContainer",
    ".sponsorSkipNoticeContainer",
    "#sponsorBlockPopupContainer",
    ".skipButtonControlBarContainer",
    "#previewbar",
    "#shadowPreviewbar",
    "#bsbPortButton",
    "#bsbDescriptionContainer",
];

const bsbElementsSelector = bsbElements.join(", ");

export function cleanPage() {
    // For live-updates
    if (document.readyState === "complete") {
        for (const element of document.querySelectorAll(bsbElementsSelector)) {
            element.remove();
        }
    }
}
