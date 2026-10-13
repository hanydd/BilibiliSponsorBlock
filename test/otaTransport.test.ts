/** @jest-environment node */
import { callAPI, sendRealRequestToCustomServer } from "../src/requests/background-request-proxy";

jest.mock("../src/config", () => ({
    __esModule: true,
    default: {
        ready: Promise.resolve(),
        local: {
            backendConfig: {
                backends: [{ id: "main", api_url: "https://primary.test", mirrors: [], enabled: true, capabilities: [] }],
            },
            backendEnabledMap: {},
        },
    },
}));

beforeEach(() => {
    (global as unknown as { chrome: unknown }).chrome = {
        storage: { local: {
            get: (_key: string, callback: (value: object) => void) => callback({}),
            set: (_items: object, callback: () => void) => callback(),
        } },
        runtime: { getManifest: () => ({ version: "test" }) },
    };
});

test("所有接口沿用普通请求的重定向行为", async () => {
    const fetchMock = jest.fn().mockImplementation(async () => new Response("{}"));
    global.fetch = fetchMock;
    for (const endpoint of ["/api/ota", "/api/userInfo"]) {
        expect((await sendRealRequestToCustomServer("GET", "https://primary.test" + endpoint)).ok).toBe(true);
        expect(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1].redirect).toBe("follow");
    }
});

test("响应大小限制由客户端选项控制，适用于任意接口", async () => {
    global.fetch = jest.fn().mockImplementation(async () => new Response("12345"));
    expect(await sendRealRequestToCustomServer("GET", "https://primary.test/api/userInfo", {}, {}, undefined, {
        maxResponseBytes: 4,
    })).toEqual({ ok: false, status: 200, responseText: "" });
    expect(await sendRealRequestToCustomServer("GET", "https://primary.test/api/ota")).toEqual({
        ok: true, status: 200, responseText: "12345",
    });
});

test("请求超时不会误报成响应大小错误", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response("12345"));
    const controller = new AbortController(); controller.abort();
    await expect(sendRealRequestToCustomServer("GET", "https://primary.test/api/userInfo", {}, {}, controller.signal, {
        maxResponseBytes: 4,
    })).rejects.toThrow();
});

test("clientOptions 不进入请求体或请求头，原有缓存参数继续生效", async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('{"enabled":true}'));
    global.fetch = fetchMock;
    const body = { userID: "test" };
    await callAPI("POST", "/api/settings", body, true, { "X-Test": "header" }, {
        maxResponseBytes: 128,
        retry: false,
        recordFailure: false,
        validateResponse: (response) => response.ok,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://primary.test/api/settings");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
        method: "POST",
        body: JSON.stringify(body),
        headers: {
            "X-Test": "header", "X-SKIP-CACHE": "1", "cache-control": "no-cache",
            "Content-Type": "application/json", "X-EXT-VERSION": "test",
        },
    });
    expect(Object.keys(fetchMock.mock.calls[0][1].headers).sort()).toEqual([
        "Content-Type", "X-EXT-VERSION", "X-SKIP-CACHE", "X-Test", "cache-control",
    ]);
});

test("GET 查询参数只包含请求数据", async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response("valid"));
    global.fetch = fetchMock;
    await callAPI("GET", "/api/query", { userID: "test" }, false, {}, {
        retry: true,
        recordFailure: false,
        maxResponseBytes: 16,
        validateResponse: (response) => response.responseText === "valid",
    });
    expect(fetchMock.mock.calls[0][0]).toBe("https://primary.test/api/query?userID=test");
    expect(fetchMock.mock.calls[0][1].body).toBeNull();
    expect(fetchMock.mock.calls[0][1].headers).toEqual({});
});
