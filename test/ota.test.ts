/** @jest-environment node */
import Config from "../src/config";
import { checkSponsorRegexConfigUpdate } from "../src/requests/background/sponsorRegexConfigUpdate";
import { OTA_MAX_BYTES, parseOtaConfig } from "../src/config/otaConfig";
import { readResponseText } from "../src/requests/readResponseText";
import { callAPI } from "../src/requests/background-request-proxy";

jest.mock("../src/config", () => ({
    __esModule: true,
    default: { ready: Promise.resolve(), config: {}, local: {} },
}));
jest.mock("../src/requests/background-request-proxy", () => ({ callAPI: jest.fn() }));

const rule = { id: "test", locales: { en: "Test" }, pattern: "推广", enabled: true, version: 2,
    updateAt: { year: 2026, month: 10, day: 12 } };
const packageFor = (data: unknown = { rules: [rule] }) => ({ schemaVersion: 1, configs: { sponsorRegex: { schemaVersion: 1, data } } });
const requestApi = callAPI as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    Config.local.sponsorRegexRemoteConfig = { rules: [{ ...rule, version: 1 }] };
    Config.local.lastSponsorRegexConfigCheck = 0;
    Config.local.lastSponsorRegexConfigCheckFailed = false;
    requestApi.mockImplementation(async (_type, _endpoint, _data, _skip, _headers, { validateResponse: validate }) => {
        const response = { ok: true, status: 200, responseText: JSON.stringify(packageFor()) };
        return validate(response) ? response : { ok: false, status: -1, responseText: "" };
    });
});

test("拉取通用配置包，应用已注册配置", async () => {
    expect(await checkSponsorRegexConfigUpdate(true)).toEqual({ status: "updated" });
    expect(Config.local.sponsorRegexRemoteConfig.rules).toEqual([rule]);
    expect(Config.local.lastSponsorRegexConfigCheckFailed).toBe(false);
    expect(Config.local.lastSponsorRegexConfigCheck).toBeGreaterThan(0);
    expect(requestApi).toHaveBeenCalledWith("GET", "/api/ota", {}, false, {}, expect.objectContaining({
        retry: true, maxResponseBytes: OTA_MAX_BYTES, recordFailure: false,
        validateResponse: expect.any(Function),
    }));
});

test("有效配置无更新时结束，不继续尝试源", async () => {
    Config.local.sponsorRegexRemoteConfig = { rules: [rule] };
    const snapshot = Config.local.sponsorRegexRemoteConfig;
    expect(await checkSponsorRegexConfigUpdate(true)).toEqual({ status: "up-to-date" });
    expect(Config.local.sponsorRegexRemoteConfig).toBe(snapshot);
    expect(requestApi).toHaveBeenCalledTimes(1);
});

test("未知配置不写入用户设置", async () => {
    const value = { schemaVersion: 1, configs: { userID: { schemaVersion: 1, data: { value: "attacker" } } } };
    requestApi.mockImplementation(async (_type, _endpoint, _data, _skip, _headers, { validateResponse: validate }) => {
        const response = { ok: true, status: 200, responseText: JSON.stringify(value) };
        validate(response); return response;
    });
    const snapshot = Config.local.sponsorRegexRemoteConfig;
    expect(await checkSponsorRegexConfigUpdate(true)).toEqual({ status: "up-to-date" });
    expect(Config.config.userID).toBeUndefined();
    expect(Config.local.sponsorRegexRemoteConfig).toBe(snapshot);
});

test("坏正则、重复 ID、未知 schema、原型污染和超大响应全部拒绝", () => {
    const badRegex = packageFor({ rules: [{ ...rule, pattern: "(" }] });
    const duplicates = packageFor({ rules: [rule, rule] });
    const invalidName = packageFor({ rules: [{ ...rule, name: 42 }] });
    const wrongSchema = packageFor(); wrongSchema.configs.sponsorRegex.schemaVersion = 2;
    for (const value of [badRegex, duplicates, invalidName, wrongSchema, { schemaVersion: 2, configs: {} }]) {
        expect(() => parseOtaConfig(JSON.stringify(value))).toThrow();
    }
    expect(() => parseOtaConfig('{"schemaVersion":1,"configs":{"userID":{"schemaVersion":1,"data":{"__proto__":{"x":1}}}}}')).toThrow();
    expect(() => parseOtaConfig(" ".repeat(OTA_MAX_BYTES + 1))).toThrow();
});

test("坏响应保持现有配置并记录失败", async () => {
    requestApi.mockImplementation(async (_type, _endpoint, _data, _skip, _headers, { validateResponse: validate }) => {
        expect(validate({ ok: true, status: 200, responseText: JSON.stringify(packageFor({ rules: [{ ...rule, pattern: "(" }] })) })).toBe(false);
        return { ok: false, status: -1, responseText: "" };
    });
    const snapshot = Config.local.sponsorRegexRemoteConfig;
    expect(await checkSponsorRegexConfigUpdate(true)).toEqual({ status: "failed" });
    expect(Config.local.sponsorRegexRemoteConfig).toBe(snapshot);
    expect(Config.local.lastSponsorRegexConfigCheckFailed).toBe(true);
});

test("24 小时节流，失败后 6 小时重试，手动检查有 5 分钟冷却", async () => {
    Config.local.lastSponsorRegexConfigCheck = Date.now() - 7 * 60 * 60 * 1000;
    expect(await checkSponsorRegexConfigUpdate()).toEqual({ status: "up-to-date" });
    expect(requestApi).not.toHaveBeenCalled();
    Config.local.lastSponsorRegexConfigCheckFailed = true;
    await checkSponsorRegexConfigUpdate();
    expect(requestApi).toHaveBeenCalledTimes(1);
    // 手动检查也有最小间隔，重复点击不会绕过冷却。
    await checkSponsorRegexConfigUpdate(true);
    expect(requestApi).toHaveBeenCalledTimes(1);
    Config.local.lastSponsorRegexConfigCheck = Date.now() - 5 * 60 * 1000;
    await checkSponsorRegexConfigUpdate(true);
    expect(requestApi).toHaveBeenCalledTimes(2);
});

test("自动检查与手动检查同时发生时只发送一个请求", async () => {
    let finish: () => void;
    requestApi.mockImplementation(() => new Promise((resolve) => { finish = () => resolve({ ok: false }); }));
    const first = checkSponsorRegexConfigUpdate();
    const second = checkSponsorRegexConfigUpdate(true);
    await Promise.resolve();
    expect(requestApi).toHaveBeenCalledTimes(1);
    expect(Config.local.lastSponsorRegexConfigCheck).toBeGreaterThan(0);
    expect(Config.local.lastSponsorRegexConfigCheckFailed).toBe(true);
    finish();
    expect(await first).toEqual({ status: "failed" });
    expect(await second).toEqual({ status: "failed" });
});

test("读取真实字节数，支持分块 UTF-8，超限时中止", async () => {
    const bytes = new TextEncoder().encode("推广");
    const response = new Response(new ReadableStream({ start(controller) {
        controller.enqueue(bytes.slice(0, 2)); controller.enqueue(bytes.slice(2)); controller.close();
    } }));
    expect(await readResponseText(response, OTA_MAX_BYTES)).toBe("推广");
    await expect(readResponseText(new Response("x".repeat(OTA_MAX_BYTES + 1)), OTA_MAX_BYTES)).rejects.toThrow("too large");
    await expect(readResponseText(new Response("x", { headers: { "content-length": String(OTA_MAX_BYTES + 1) } }), OTA_MAX_BYTES)).rejects.toThrow("too large");
});
