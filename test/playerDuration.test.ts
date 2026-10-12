/** @jest-environment jsdom */
import { getPlayerTimelineDuration } from "../src/utils/playerDuration";

afterEach(() => document.body.replaceChildren());

function makePlayer(duration: number, label: string): HTMLVideoElement {
    document.body.innerHTML = `<div class="bpx-player-container"><video></video>
        <span class="bpx-player-ctrl-time-duration">${label}</span></div>`;
    const video = document.querySelector("video");
    Object.defineProperty(video, "duration", { value: duration });
    return video;
}

test("uses the full episode timeline for a three minute membership trial", () => {
    expect(getPlayerTimelineDuration(makePlayer(180.16, "20:27"))).toBe(1227);
});

test("preserves media precision for ordinary videos", () => {
    expect(getPlayerTimelineDuration(makePlayer(180.16, "03:00"))).toBe(180.16);
});

test("preserves media precision when the native label rounds up", () => {
    expect(getPlayerTimelineDuration(makePlayer(180.16, "03:01"))).toBe(180.16);
});

test.each(["", "--:--", "invalid"])("falls back to media duration for label %s", (label) => {
    expect(getPlayerTimelineDuration(makePlayer(180.16, label))).toBe(180.16);
});

test("ignores other players and handles unavailable metadata", () => {
    const video = makePlayer(NaN, "01:02:03");
    expect(getPlayerTimelineDuration(video)).toBe(3723);
    expect(getPlayerTimelineDuration(document.createElement("video"))).toBe(0);
    expect(getPlayerTimelineDuration(null)).toBe(0);
});

test("follows a native axis shorter than the media instead of assuming every mismatch is a trial", () => {
    expect(getPlayerTimelineDuration(makePlayer(754, "12:23"))).toBe(743);
});

test("issue 326 ignores the longer API duration and follows finalized audio/video media precision", () => {
    const video = makePlayer(742.8973333333333, "12:23");
    expect(getPlayerTimelineDuration(video)).toBe(742.8973333333333);
});

test("refreshes the axis when the native total changes without a media durationchange", () => {
    const video = makePlayer(754, "12:34");
    expect(getPlayerTimelineDuration(video)).toBe(754);
    document.querySelector(".bpx-player-ctrl-time-duration").textContent = "12:23";
    expect(getPlayerTimelineDuration(video)).toBe(743);
});
