/** @jest-environment jsdom */
import Config from "../src/config";
import { checkCidReplacement } from "../src/content/cidReplacement";
import { getCidReplacementPageFromWindow } from "../src/utils/injectedScriptMessageUtils";
import { getVideo, getVideoID } from "../src/utils/video";
import { NewVideoID, SponsorSourceType, SponsorTime } from "../src/types";
import { CalculateBvidToAvid } from "../src/utils/bvidAvidUtils";
import { BVID } from "../src/types";
import { readCidReplacementPage } from "../src/document/cidReplacementPage";

jest.mock("../src/config", () => ({ __esModule: true, default: { config: { isVip: true, userID: "private-test" } } }));
jest.mock("../src/utils/injectedScriptMessageUtils", () => ({ getCidReplacementPageFromWindow: jest.fn() }));
jest.mock("../src/utils/video", () => ({ getVideo: jest.fn(), getVideoID: jest.fn() }));
const videoID = "BV1r3426vEN4+200" as NewVideoID;
const snapshot = { videoID: "BV1r3426vEN4", pages: [{ page: 1, cid: "200", duration: 120 }] };
const segments = [{ cid: "100", videoDuration: 120, source: SponsorSourceType.Server }] as SponsorTime[];
let refresh: jest.Mock;
let send: jest.Mock;
beforeEach(() => {
    jest.clearAllMocks();
    Config.config.isVip = true;
    Config.config.userID = "private-test";
    (getVideo as jest.Mock).mockReturnValue({ duration: 120.3, currentSrc: "video.mp4" });
    (getVideoID as jest.Mock).mockReturnValue(videoID);
    (getCidReplacementPageFromWindow as jest.Mock).mockResolvedValue(snapshot);
    refresh = jest.fn().mockResolvedValue(undefined);
    send = jest.fn((_message, callback) => callback({ migrated: true }));
    (global as unknown as { chrome: unknown }).chrome = { runtime: { sendMessage: send, lastError: null } };
});
test("successful or partial migration refreshes once; no credentials sent to page", async () => {
    await checkCidReplacement(videoID, segments, refresh);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual({ message: "reportCidReplacement",
        candidates: [{ videoID: snapshot.videoID, oldCid: "100", newCid: "200" }] });
    expect(getCidReplacementPageFromWindow).toHaveBeenCalledWith(snapshot.videoID);
});
test("non-VIP does not request page metadata or trigger network", async () => {
    Config.config.isVip = false;
    await checkCidReplacement(videoID, segments, refresh);
    expect(getCidReplacementPageFromWindow).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
});
test("SPA change while reading pages cancels report", async () => {
    (getCidReplacementPageFromWindow as jest.Mock).mockImplementation(async () => {
        (getVideoID as jest.Mock).mockReturnValue("BV1tHbj6PEMZ+300");
        return snapshot;
    });
    await checkCidReplacement(videoID, segments, refresh);
    expect(send).not.toHaveBeenCalled();
});
test("SPA change while verifying does not refresh or inject old results", async () => {
    send.mockImplementation((_message, callback) => {
        (getVideoID as jest.Mock).mockReturnValue("BV1tHbj6PEMZ+300");
        callback({ migrated: true });
    });
    await checkCidReplacement(videoID, segments, refresh);
    expect(refresh).not.toHaveBeenCalled();
});
test("rejected, busy or disconnected background never refreshes", async () => {
    for (const result of [{ migrated: false }, undefined]) {
        send.mockImplementation((_message, callback) => callback(result));
        await checkCidReplacement(videoID, segments, refresh);
    }
    expect(refresh).not.toHaveBeenCalled();
});
test("page snapshot requires matching live manifest and fresh single-P pages", () => {
    Object.defineProperty(window, "__INITIAL_STATE__", { configurable: true, value: {
        bvid: snapshot.videoID, videoData: { pages: [{ page: 1, cid: 200, duration: 120 }] },
    } });
    const getManifest = jest.fn<unknown, []>(() => ({ bvid: snapshot.videoID, cid: 200, p: 1 }));
    Object.defineProperty(window, "player", { configurable: true, value: { getManifest } });
    expect(readCidReplacementPage(snapshot.videoID)).toEqual(snapshot);
    getManifest.mockReturnValue({ aid: CalculateBvidToAvid(snapshot.videoID as BVID), cid: 200, p: 1 });
    expect(readCidReplacementPage(snapshot.videoID)).toEqual(snapshot);
    getManifest.mockReturnValue({ bvid: "BV1tHbj6PEMZ", cid: 200, p: 1 });
    expect(readCidReplacementPage(snapshot.videoID)).toBeNull();
    getManifest.mockReturnValue({ bvid: snapshot.videoID, cid: 300, p: 1 });
    expect(readCidReplacementPage(snapshot.videoID)).toBeNull();
    getManifest.mockReturnValue({ bvid: snapshot.videoID, cid: 200, p: 1 });
    window.__INITIAL_STATE__.videoData.pages.push({ ...window.__INITIAL_STATE__.videoData.pages[0], page: 2 });
    expect(readCidReplacementPage(snapshot.videoID)).toBeNull();
});

test("segment response before media metadata waits without blocking publication", async () => {
    const video = document.createElement("video");
    (getVideo as jest.Mock).mockReturnValue(video);
    const pending = checkCidReplacement(videoID, segments, refresh);
    expect(send).not.toHaveBeenCalled();
    Object.defineProperty(video, "duration", { value: 120.3 });
    Object.defineProperty(video, "currentSrc", { value: "loaded.mp4" });
    video.dispatchEvent(new Event("loadedmetadata"));
    await pending;
    expect(send).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
});
