export function getFormattedTimeToSeconds(formatted: string): number | null {
    const fragments = /^(?:(?:(\d+):)?(\d+):)?(\d*(?:[.,]\d+)?)$/.exec(formatted);

    if (fragments === null) {
        return null;
    }

    const hours = fragments[1] ? parseInt(fragments[1]) : 0;
    const minutes = fragments[2] ? parseInt(fragments[2] || '0') : 0;
    const seconds = fragments[3] ? parseFloat(fragments[3].replace(',', '.')) : 0;

    return hours * 3600 + minutes * 60 + seconds;
}

export function getFormattedTime(seconds: number, precise?: boolean): string | null {
    seconds = Math.max(seconds, 0);
    
    const hours = Math.floor(seconds / 60 / 60);
    const minutes = Math.floor(seconds / 60) % 60;
    let minutesDisplay = String(minutes);
    let secondsNum = seconds % 60;
    if (!precise) {
        secondsNum = Math.floor(secondsNum);
    }

    let secondsDisplay = String(precise ? secondsNum.toFixed(3) : secondsNum);
    
    if (secondsNum < 10) {
        //add a zero
        secondsDisplay = "0" + secondsDisplay;
    }
    if (hours && minutes < 10) {
        //add a zero
        minutesDisplay = "0" + minutesDisplay;
    }
    if (isNaN(hours) || isNaN(minutes)) {
        return null;
    }

    const formatted = (hours ? hours + ":" : "") + minutesDisplay + ":" + secondsDisplay;

    return formatted;
}

/**
 * Gets the error message in a nice string
 * 
 * @param {int} statusCode 
 * @returns {string} errorMessage
 */
export function getErrorMessage(statusCode: number, responseText: string): string {
    const postFix = ((responseText && !(responseText.includes(`cf-wrapper`) || responseText.includes("<!DOCTYPE html>"))) ? "\n\n" + responseText : "");
    // display response body for 4xx
    if([400, 409, 0].includes(statusCode)) {
        return chrome.i18n.getMessage(statusCode + "") + " " + chrome.i18n.getMessage("errorCode") + statusCode + postFix;
    } else if (statusCode >= 500 && statusCode <= 599) {
        // 503 == 502
        if (statusCode == 503) statusCode = 502;
        return chrome.i18n.getMessage(statusCode + "") + " " + chrome.i18n.getMessage("errorCode") + statusCode
        + "\n\n" + chrome.i18n.getMessage("statusReminder");
    } else {
        return chrome.i18n.getMessage("connectionError") + statusCode + postFix;
    }
}