import { ActionType, Category, SponsorTime } from "../types";
import Config from "../config";

export function getSkippingText(segments: SponsorTime[], autoSkip: boolean): string {
    const categoryName =
        chrome.i18n.getMessage(
            segments.length > 1 ? "multipleSegments" : "category_" + segments[0].category + "_short"
        ) || chrome.i18n.getMessage("category_" + segments[0].category);
    if (autoSkip) {
        let messageId = "";
        switch (segments[0].actionType) {
            case ActionType.Skip:
                if (Config.config.advanceSkipNotice && Config.config.skipNoticeDurationBefore > 0) {
                    messageId = "autoSkipped";
                } else {
                    messageId = "skipped";
                }
                break;
            case ActionType.Mute:
                if (Config.config.advanceSkipNotice && Config.config.skipNoticeDurationBefore > 0) {
                    messageId = "autoMuted";
                } else {
                    messageId = "muted";
                }
                break;
            case ActionType.Poi:
                messageId = "skipped_to_category";
                break;
        }

        return chrome.i18n.getMessage(messageId).replace("{0}", categoryName);
    } else {
        let messageId = "";
        switch (segments[0].actionType) {
            case ActionType.Skip:
                messageId = "skip_category";
                break;
            case ActionType.Mute:
                messageId = "mute_category";
                break;
            case ActionType.Poi:
                messageId = "skip_to_category";
                break;
        }

        return chrome.i18n.getMessage(messageId).replace("{0}", categoryName);
    }
}

export function getCategorySuffix(category: Category): string {
    if (category.startsWith("poi_")) {
        return "_POI";
    } else if (category === "exclusive_access") {
        return "_full";
    } else {
        return "";
    }
}

export function shortCategoryName(categoryName: string): string {
    return (
        chrome.i18n.getMessage("category_" + categoryName + "_short") ||
        chrome.i18n.getMessage("category_" + categoryName)
    );
}

export const DEFAULT_CATEGORY = "chooseACategory";
