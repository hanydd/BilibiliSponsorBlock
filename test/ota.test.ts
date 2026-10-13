/** @jest-environment node */
import Config from "../src/config";
import { checkSponsorRegexConfigUpdate } from "../src/requests/background/sponsorRegexConfigUpdate";
import { OTA_MAX_BYTES, parseOtaConfig } from "../src/config/otaConfig";
import { readResponseText } from "../src/requests/readResponseText";
import { callAPI } from "../src/requests/background-request-proxy";
import { builtinServers, migrateServerPreferences } from "../src/config/officialServers";
import { getEffectiveServers, removeServer } from "../src/config/serverPreferences";

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
    Config.local.officialServers = null;
    Config.config.serverPreferences = migrateServerPreferences(builtinServers.nodes[0].address, [], false);
    Config.local.sponsorRegexRemoteConfig = { rules: [{ ...rule, version: 1 }] };
    Config.local.lastSponsorRegexConfigCheck = 0;
    Config.local.lastSponsorRegexConfigCheckFailed = false;
    requestApi.mockImplementation(async (_type, _endpoint, _data, _skip, _headers, { validateResponse: validate }) => {
        const response = { ok: true, status: 200, responseText: JSON.stringify(packageFor()) };
        return validate(response) ? response : { ...response, ok: false };
    });
});

const servers = {
    version: 2,
    nodes: [
        { id: "official-primary", address: "https://new-primary.test", kind: "primary" },
        { id: "official-alias", address: "https://new-alias.test", kind: "alias" },
    ],
};

function serveConfig(configs: Record<string, unknown>): void {
    requestApi.mockImplementation(async (_type, _endpoint, _data, _skip, _headers, { validateResponse: validate }) => {
        const response = { ok: true, status: 200, responseText: JSON.stringify({ schemaVersion: 1, configs }) };
        return validate(response) ? response : { ...response, ok: false };
    });
}

test("正则与官方地址共用一次后台 OTA 请求，用户设置保持不变", async () => {
    Config.config.serverPreferences.added = ["https://user.test"];
    const preferences = JSON.stringify(Config.config.serverPreferences);
    serveConfig({ ...packageFor().configs, servers: { schemaVersion: 1, data: servers } });
    expect(await checkSponsorRegexConfigUpdate()).toEqual({ status: "updated" });
    expect(requestApi).toHaveBeenCalledTimes(1);
    expect(Config.local.sponsorRegexRemoteConfig.rules).toEqual([rule]);
    expect(getEffectiveServers()).toEqual({
        primary: servers.nodes[0].address, mirrors: [servers.nodes[1].address, "https://user.test"],
    });
    expect(JSON.stringify(Config.config.serverPreferences)).toBe(preferences);
});

test("仅官方地址更新也返回 updated，旧清单不能回退缓存", async () => {
    serveConfig({ servers: { schemaVersion: 1, data: servers } });
    expect(await checkSponsorRegexConfigUpdate(true)).toEqual({ status: "updated" });
    const snapshot = Config.local.officialServers;
    Config.local.lastSponsorRegexConfigCheck = 0;
    serveConfig({ servers: { schemaVersion: 1, data: builtinServers } });
    expect(await checkSponsorRegexConfigUpdate(true)).toEqual({ status: "up-to-date" });
    expect(Config.local.officialServers).toBe(snapshot);
});

test("OTA addresses are normalized before saving and deleting a displayed address remains effective", async () => {
    const feed = { ...servers, nodes: servers.nodes.map((node) => ({ ...node, address: `${node.address}/` })) };
    serveConfig({ servers: { schemaVersion: 1, data: feed } });
    expect(await checkSponsorRegexConfigUpdate()).toEqual({ status: "updated" });
    expect(Config.local.officialServers).toEqual(servers);
    expect(feed.nodes[1].address).toBe("https://new-alias.test/");
    const displayedAddress = getEffectiveServers().mirrors[0];
    expect(displayedAddress).toBe(Config.local.officialServers.nodes[1].address);
    removeServer(displayedAddress);
    expect(Config.config.serverPreferences.excludedIds).toEqual(["official-alias"]);
    expect(getEffectiveServers().mirrors).toEqual([]);
    Config.local.lastSponsorRegexConfigCheck = 0;
    serveConfig({ servers: { schemaVersion: 1, data: { ...feed, version: 3 } } });
    await checkSponsorRegexConfigUpdate();
    expect(getEffectiveServers().mirrors).toEqual([]);
});

test("OTA 可清空全部官方地址，保留手动地址且不恢复随包节点", async () => {
    Config.config.serverPreferences.added = ["https://user.test"];
    serveConfig({ servers: { schemaVersion: 1, data: { version: 2, nodes: [] } } });
    expect(await checkSponsorRegexConfigUpdate()).toEqual({ status: "updated" });
    expect(getEffectiveServers()).toEqual({ primary: "", mirrors: ["https://user.test"] });
});

test.each([
    { schemaVersion: 2, data: servers },
    { schemaVersion: 1, data: { ...servers, nodes: null } },
    { schemaVersion: 1, data: { ...servers, nodes: [servers.nodes[0], servers.nodes[0]] } },
])("非法服务器配置拒绝整个包，不部分应用正则：%j", async (invalid) => {
    const rules = Config.local.sponsorRegexRemoteConfig;
    serveConfig({ ...packageFor().configs, servers: invalid });
    expect(await checkSponsorRegexConfigUpdate()).toEqual({ status: "failed" });
    expect(Config.local.sponsorRegexRemoteConfig).toBe(rules);
    expect(Config.local.officialServers).toBeNull();
});

test("旧后端未提供服务器清单时保留地址缓存，网络失败也不清空", async () => {
    Config.local.officialServers = { ...servers, nodes: [] };
    const snapshot = Config.local.officialServers;
    await checkSponsorRegexConfigUpdate();
    expect(Config.local.officialServers).toBe(snapshot);
    Config.local.lastSponsorRegexConfigCheck = 0;
    requestApi.mockResolvedValue({ ok: false, status: 503, responseText: "Unavailable" });
    expect(await checkSponsorRegexConfigUpdate()).toEqual({ status: "failed" });
    expect(Config.local.officialServers).toBe(snapshot);
});

test("拉取通用配置包，应用已注册配置", async () => {
    expect(await checkSponsorRegexConfigUpdate(true)).toEqual({ status: "updated" });
    expect(Config.local.sponsorRegexRemoteConfig.rules).toEqual([rule]);
    expect(Config.local.lastSponsorRegexConfigCheckFailed).toBe(false);
    expect(Config.local.lastSponsorRegexConfigCheck).toBeGreaterThan(0);
    expect(requestApi).toHaveBeenCalledWith("GET", "/api/ota", {}, false, {}, expect.objectContaining({
        retry: true, maxResponseBytes: OTA_MAX_BYTES, recordFailure: false, switchOnRetrySuccess: false,
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
        const response = { ok: true, status: 200, responseText: JSON.stringify(packageFor({ rules: [{ ...rule, pattern: "(" }] })) };
        expect(validate(response)).toBe(false);
        return { ...response, ok: false };
    });
    const snapshot = Config.local.sponsorRegexRemoteConfig;
    expect(await checkSponsorRegexConfigUpdate(true)).toEqual({ status: "failed" });
    expect(Config.local.sponsorRegexRemoteConfig).toBe(snapshot);
    expect(Config.local.lastSponsorRegexConfigCheckFailed).toBe(true);
});

test("以请求最终返回值为准，候选配置通过校验也不能覆盖失败结果", async () => {
    requestApi.mockImplementation(async (_type, _endpoint, _data, _skip, _headers, { validateResponse: validate }) => {
        const response = { ok: true, status: 200, responseText: JSON.stringify(packageFor()) };
        expect(validate(response)).toBe(true);
        return { ...response, ok: false };
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
