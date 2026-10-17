/** @jest-environment jsdom */
import { DocumentPipTimelineAdapter, PageTimelineAdapter } from "../src/player/TimelineAdapter";
import PreviewBar, { PreviewBarSegment } from "../src/js-components/previewBar";

jest.mock("../src/config", () => ({ __esModule: true, default: { config: { barTypes: { sponsor: { color: "#00ff00", opacity: 0.7 } } } } }));
jest.mock("../src/utils/categoryUtils", () => ({ shortCategoryName: () => "Sponsor" }));

const segment = { segment: [20, 40], category: "sponsor" } as PreviewBarSegment;
afterEach(() => document.body.replaceChildren());

test("a shared model moves between page and PiP tracks, including late audio controls", async () => {
    document.body.innerHTML = '<div class="bpx-player-container"><video></video><div class="bpx-player-progress"></div></div>';
    const video = document.querySelector("video");
    Object.defineProperty(video, "duration", { value: 120.25 });
    const preview = new PreviewBar();
    const page = new PageTimelineAdapter(document);
    preview.set([segment], page.read(video).duration);
    preview.syncTargets(page.read(video).targets);
    expect(document.querySelectorAll("#previewbar > li")).toHaveLength(1);

    const pip = document.implementation.createHTMLDocument();
    pip.body.innerHTML = '<div class="bpx-player-rich-pip-root"><span class="bpx-player-rich-pip-time-label">00:05 / 04:00</span><div class="bpx-player-rich-pip-progress"></div></div>';
    pip.querySelector(".bpx-player-rich-pip-root").append(video);
    const adapter = new DocumentPipTimelineAdapter(pip);
    const sync = () => { const snapshot = adapter.read(video); preview.syncTargets(snapshot.targets); preview.set([segment], snapshot.duration); };
    const stop = adapter.observe(sync);
    sync();
    expect(document.querySelector("#previewbar")).toBeNull();
    expect(pip.querySelector("#pipPreviewbar").ownerDocument).toBe(pip);
    expect(parseFloat((pip.querySelector("#pipPreviewbar > li") as HTMLElement).style.left)).toBeCloseTo(20 / 240 * 100);
    pip.querySelector(".bpx-player-rich-pip-root").insertAdjacentHTML("beforeend", '<div class="bpx-player-rich-pip-audio-progress"></div>');
    await Promise.resolve();
    expect(pip.querySelectorAll("#pipAudioPreviewbar > li")).toHaveLength(1);
    // An elapsed-time update preserves native duration precision.
    pip.querySelector(".bpx-player-rich-pip-time-label").textContent = "00:15 / 02:00";
    await Promise.resolve();
    expect(preview.videoDuration).toBe(120.25);
    stop();
    preview.remove();
    pip.querySelector(".bpx-player-rich-pip-progress").replaceChildren();
    await Promise.resolve();
    expect(pip.querySelector(".sbSegmentOverlay")).toBeNull();
});

test("PiP ignores adopted legacy bars and reads an audio-only duration", () => {
    document.body.innerHTML = '<div class="bpx-player-rich-pip-root"><video></video><div class="bpx-player-progress"></div><span class="bpx-player-rich-pip-audio-duration">10:00</span><div class="bpx-player-rich-pip-audio-progress"></div></div>';
    const snapshot = new DocumentPipTimelineAdapter(document).read(document.querySelector("video"));
    expect(snapshot.duration).toBe(600);
    expect(snapshot.targets.map(target => target.id)).toEqual(["pipAudioPreviewbar"]);
});

test("observer ignores decorative rendering but recovers deleted overlays and stops on disposal", async () => {
    document.body.innerHTML = '<div class="bpx-player-container"><video></video><div class="bpx-player-progress"></div></div>';
    const adapter = new PageTimelineAdapter(document);
    const changed = jest.fn();
    const stop = adapter.observe(changed);
    const preview = new PreviewBar();
    preview.syncTargets(adapter.read(document.querySelector("video")).targets);
    preview.set([segment], 120);
    await Promise.resolve();
    expect(changed).not.toHaveBeenCalled();
    document.querySelector("#previewbar").remove();
    await Promise.resolve();
    expect(changed).toHaveBeenCalledTimes(1);
    stop();
    document.querySelector(".bpx-player-progress").remove();
    await Promise.resolve();
    expect(changed).toHaveBeenCalledTimes(1);
    preview.remove();
});
