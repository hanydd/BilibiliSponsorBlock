/** @jest-environment jsdom */
import { getActivePlayerVideo, getControls, getLeftControls, getPlayerContainer, getProgressBar } from "../src/utils/pageUtils";

afterEach(() => document.body.replaceChildren());

test("ignores stale and preview controls when no active player video is present", () => {
    document.body.innerHTML = `
        <div class="bpx-player-control-bottom-left" data-player="stale"></div>
        <div class="bpx-player-control-bottom-right" data-player="stale"></div>
        <div class="v-recommend-inline-player">
            <div class="bpx-player-control-bottom-left" data-player="preview"></div>
            <div class="bpx-player-control-bottom-right" data-player="preview"></div>
        </div>
        <div class="bpx-player-control-bottom-left" data-player="main"></div>
        <div class="bpx-player-control-bottom-right" data-player="main"></div>`;
    expect(getLeftControls()).toBeNull();
    expect(getControls()).toBeNull();
    expect(getProgressBar()).toBeNull();
});

test("uses controls and timeline belonging to the active video, ignoring other players", () => {
    document.body.innerHTML = `<div class="v-recommend-inline-player">
        <div class="bpx-player-progress-schedule" id="preview-progress"></div></div>
        <div id="bilibili-player"><div class="bpx-player-container" id="active-player">
            <video></video><div class="bpx-player-control-bottom-left" id="left"></div>
            <div class="bpx-player-control-bottom-right" id="right"></div>
            <div class="bpx-player-progress-schedule" id="progress"></div>
            <div class="bpx-player-progress-schedule" id="shadow"></div>
        </div></div><div class="bpx-player-control-bottom-right" id="other-player"></div>`;
    expect(getPlayerContainer()?.id).toBe("active-player");
    expect(getControls()?.id).toBe("right");
    expect(getLeftControls()?.id).toBe("left");
    expect(getProgressBar()?.id).toBe("progress");
});

test("ignores a video prepared for seamless replacement", () => {
    document.body.innerHTML = `<div id="bilibili-player">
        <div class="bpx-player-container" id="replacement"><video class="bpx-player-seamless-replacement"></video></div>
        <div class="bpx-player-container" id="active"><video></video></div></div>`;
    expect(getPlayerContainer()?.id).toBe("active");
});

test("shares video selection rules for nested previews, prepared videos, and control ownership", () => {
    document.body.innerHTML = '<div id="bilibili-player">' +
        '<div class="v-recommend-inline-player"><video></video></div>' +
        '<div class="bpx-player-container"><video class="bpx-player-seamless-replacement"></video></div>' +
        '<div class="bpx-player-container" id="active"><video id="video"></video>' +
        '<div class="bpx-player-control-bottom-right" id="controls"></div></div></div>';
    const video = getActivePlayerVideo(), root = getPlayerContainer(video);
    expect(video.id).toBe("video");
    expect(root.id).toBe("active");
    expect(getControls(root).id).toBe("controls");
});
