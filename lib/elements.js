"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getYouTubeTitleNode = void 0;
function getYouTubeTitleNode() {
    // New YouTube Title, YouTube, Mobile YouTube, Invidious
    return document.querySelector("#title h1, .ytd-video-primary-info-renderer.title, .slim-video-information-title, #player-container + .h-box > h1");
}
exports.getYouTubeTitleNode = getYouTubeTitleNode;
//# sourceMappingURL=elements.js.map