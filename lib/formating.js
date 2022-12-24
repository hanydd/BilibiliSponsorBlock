"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFormattedTime = exports.getFormattedTimeToSeconds = void 0;
function getFormattedTimeToSeconds(formatted) {
    const fragments = /^(?:(?:(\d+):)?(\d+):)?(\d*(?:[.,]\d+)?)$/.exec(formatted);
    if (fragments === null) {
        return null;
    }
    const hours = fragments[1] ? parseInt(fragments[1]) : 0;
    const minutes = fragments[2] ? parseInt(fragments[2] || '0') : 0;
    const seconds = fragments[3] ? parseFloat(fragments[3].replace(',', '.')) : 0;
    return hours * 3600 + minutes * 60 + seconds;
}
exports.getFormattedTimeToSeconds = getFormattedTimeToSeconds;
function getFormattedTime(seconds, precise) {
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
exports.getFormattedTime = getFormattedTime;
//# sourceMappingURL=formating.js.map