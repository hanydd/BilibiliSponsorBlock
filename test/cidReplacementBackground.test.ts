import Config from "../src/config";
import { callAPI } from "../src/requests/background-request-proxy";
import { reportCidReplacement } from "../src/requests/background/cidReplacement";

jest.mock("../src/config", () => ({ __esModule: true, default: {
    ready: Promise.resolve(), config: { isVip: true, userID: "private-test-id", testingServer: false },
} }));
jest.mock("../src/config/serverPreferences", () => ({ getEffectiveServers: () => ({ primary: "https://test.invalid" }) }));
jest.mock("../src/utils/hash", () => ({ getHash: async () => "hashed-account-and-server" }));
jest.mock("../src/requests/background-request-proxy", () => ({ callAPI: jest.fn() }));
const api = callAPI as jest.Mock;
const candidate = { videoID: "BV1r3426vEN4", oldCid: "100", newCid: "200" };
const another = { ...candidate, videoID: "BV1tHbj6PEMZ" };
let storage: Record<string, unknown>;
const reply = (status: number, body = {}) => ({ status, ok: status === 200, responseText: JSON.stringify(body) });
const result = (status = "migrated", extra = {}) => reply(200, { ...candidate, status, ...extra });

beforeEach(() => {
    jest.useFakeTimers().setSystemTime(1000000);
    api.mockReset().mockResolvedValue(result());
    Config.config.isVip = true;
    Config.config.userID = "private-test-id";
    storage = {};
    (global as unknown as { chrome: unknown }).chrome = {
        runtime: { lastError: null, getManifest: () => ({ manifest_version: 3 }), getPlatformInfo: jest.fn(callback => callback({})) }, storage: { local: {
            get: (_key, callback) => callback(storage),
            set: (items, callback) => { storage = structuredClone(items); callback(); },
        } },
    };
});
afterEach(() => jest.useRealTimers());

test("VIP and private ID required, malformed candidate never reaches network", async () => {
    Config.config.isVip = false;
    await reportCidReplacement([candidate]);
    Config.config.isVip = true;
    Config.config.userID = "";
    await reportCidReplacement([candidate]);
    Config.config.userID = "private-test-id";
    await reportCidReplacement([{ ...candidate, oldCid: candidate.newCid }]);
    expect(api).not.toHaveBeenCalled();
});
test("same pair across tabs shares one POST; other videos do not queue", async () => {
    let finish: (value: unknown) => void;
    api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = reportCidReplacement([candidate]);
    const second = reportCidReplacement([candidate]);
    expect(second).toBe(first);
    expect(await reportCidReplacement([another])).toEqual({ migrated: false });
    for (let i = 0; i < 12 && !finish; i++) await Promise.resolve();
    expect(api).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(40000);
    expect(chrome.runtime.getPlatformInfo).toHaveBeenCalledTimes(2);
    finish(result("migrated", { reason: "segments_partially_migrated" }));
    expect(await first).toEqual({ migrated: true });
    expect(jest.getTimerCount()).toBe(0);
    expect(await reportCidReplacement([candidate])).toEqual({ migrated: false });
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0]).toEqual(["POST", "/api/cidReplacement", { ...candidate, userID: "private-test-id" }, false, {},
        expect.objectContaining({ timeoutMs: 90000, retry: false, httpsOnly: true })]);
    expect(JSON.stringify(storage)).not.toContain("private-test-id");
});
test("lost POST response makes just one authenticated status read", async () => {
    api.mockResolvedValueOnce(reply(-1)).mockResolvedValueOnce(result());
    expect(await reportCidReplacement([candidate])).toEqual({ migrated: true });
    expect(api).toHaveBeenCalledTimes(2);
    expect(api.mock.calls[1]).toEqual(["GET", "/api/cidReplacement", candidate, false,
        { Authorization: "Bearer private-test-id" }, expect.objectContaining({ retry: false, timeoutMs: 15000 })]);
});
test("status 404 after timeout does not repeat POST", async () => {
    api.mockResolvedValueOnce(reply(-1)).mockResolvedValueOnce(reply(404));
    expect(await reportCidReplacement([candidate])).toEqual({ migrated: false });
    jest.advanceTimersByTime(3 * 60000);
    await reportCidReplacement([candidate]);
    expect(api).toHaveBeenCalledTimes(2);
});
test("403 persists permission denial without retries on other videos", async () => {
    api.mockResolvedValueOnce(reply(403));
    await reportCidReplacement([candidate]);
    jest.advanceTimersByTime(7 * 86400000);
    await reportCidReplacement([another]);
    expect(api).toHaveBeenCalledTimes(1);
});
test("body retryAfter milliseconds suppress all reports until cooldown expires", async () => {
    api.mockResolvedValueOnce(result("inconclusive", { retryAfter: Date.now() + 3600000 }));
    await reportCidReplacement([candidate]);
    jest.advanceTimersByTime(11 * 60000);
    await reportCidReplacement([another]);
    expect(api).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(3600000);
    await reportCidReplacement([candidate]);
    expect(api).toHaveBeenCalledTimes(2);
});
test.each([429, 503])("HTTP %s Retry-After seconds extends browser cooldown", async status => {
    api.mockResolvedValueOnce({ ...reply(status), retryAfter: "3600" }).mockResolvedValueOnce(reply(404));
    await reportCidReplacement([candidate]);
    const count = api.mock.calls.length;
    jest.advanceTimersByTime(11 * 60000);
    await reportCidReplacement([another]);
    expect(api).toHaveBeenCalledTimes(count);
});
test("rejected results wait 24 hours, malformed or foreign success never refreshes", async () => {
    api.mockResolvedValueOnce(result("rejected"));
    expect(await reportCidReplacement([candidate])).toEqual({ migrated: false });
    jest.advanceTimersByTime(3600000);
    await reportCidReplacement([candidate]);
    expect(api).toHaveBeenCalledTimes(1);
    api.mockResolvedValueOnce(result("migrated", { videoID: "other" }));
    expect(await reportCidReplacement([another])).toEqual({ migrated: false });
});
test("storage failure before POST fails closed", async () => {
    chrome.storage.local.set = jest.fn((_items, callback: () => void) => {
        Object.defineProperty(chrome.runtime, "lastError", { value: { message: "unavailable" }, configurable: true });
        callback();
    }) as unknown as typeof chrome.storage.local.set;
    expect(await reportCidReplacement([candidate])).toEqual({ migrated: false });
    expect(api).not.toHaveBeenCalled();
});

test("persisted cooldown survives a new background module instance", async () => {
    await reportCidReplacement([candidate]);
    jest.advanceTimersByTime(11 * 60000);
    let fresh: typeof reportCidReplacement;
    jest.isolateModules(() => {
        fresh = require("../src/requests/background/cidReplacement").reportCidReplacement;
    });
    expect(await fresh([candidate])).toEqual({ migrated: false });
    expect(api).toHaveBeenCalledTimes(1);
});
test("different candidates are paced for three minutes even after success", async () => {
    await reportCidReplacement([candidate]);
    await reportCidReplacement([another]);
    expect(api).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(3 * 60000);
    await reportCidReplacement([another]);
    expect(api).toHaveBeenCalledTimes(2);
});
