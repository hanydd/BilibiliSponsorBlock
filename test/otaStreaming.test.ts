/** @jest-environment node */
import { readFileSync } from "fs";
import { OTA_MAX_BYTES, parseOtaConfig } from "../src/config/otaConfig";
import { sendRealRequestToCustomServer } from "../src/requests/background-request-proxy";
import { readResponseText } from "../src/requests/readResponseText";
import { ServerRouter } from "../src/requests/serverRouter";

jest.mock("../src/config", () => ({ __esModule: true, default: {} }));
jest.mock("../src/utils/", () => ({ objectToURI: (url: string) => url }));

const payload = JSON.stringify({ schemaVersion: 1, configs: { sponsorRegex: JSON.parse(readFileSync("ota/sponsorRegex.json", "utf8")) } });
const chunkBytes = Math.ceil(new TextEncoder().encode(payload).length / 14);

/** 使用虚拟时钟逐块交付响应，验证低带宽下的读取、超时和重试行为。 */
function slowResponse(signal?: AbortSignal, stall = false): Response {
    const bytes = new TextEncoder().encode(payload);
    let offset = 0;
    return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
            signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
        },
        async pull(controller) {
            if (offset === bytes.length) { controller.close(); return; }
            if (stall) return new Promise<void>(() => undefined);
            await new Promise<void>((resolve) => setTimeout(resolve, 1000));
            controller.enqueue(bytes.slice(offset, offset + chunkBytes));
            offset = Math.min(offset + chunkBytes, bytes.length);
        },
    }));
}

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test("真实配置分成 14 个慢速数据块，正确还原且不提前结束", async () => {
    jest.useFakeTimers();
    let settled = false;
    const result = readResponseText(slowResponse(), OTA_MAX_BYTES).then((text) => { settled = true; return text; });
    await jest.advanceTimersByTimeAsync(13_000);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1000);
    expect(await result).toBe(payload);
    expect(parseOtaConfig(await result).configs.sponsorRegex.schemaVersion).toBe(1);
});

test("低带宽响应使用共用 API 的 15 秒超时，只下载一次且不探测健康接口", async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn().mockImplementation((_url, options) => Promise.resolve(slowResponse(options.signal)));
    global.fetch = fetchMock;
    const execute = jest.fn((method, url, data, headers, signal, clientOptions) => sendRealRequestToCustomServer(method, url, data, headers, signal, clientOptions));
    const router = new ServerRouter({
        getServerAddresses: () => ["https://primary.test", "https://mirror.test"],
        executeRequest: execute,
        loadState: async () => null,
        saveState: async () => undefined,
    });
    const result = router.request("GET", "/api/ota", {}, {}, {
        httpsOnly: true, retry: true, maxResponseBytes: OTA_MAX_BYTES, recordFailure: false, validateResponse: (response) => response.ok && !!parseOtaConfig(response.responseText),
    });
    await jest.advanceTimersByTimeAsync(14_000);
    expect((await result).responseText).toBe(payload);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://primary.test/api/ota");
});

test("响应一直停滞时按共用超时中止，每轮最多两个请求", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockImplementation((_url, options) => Promise.resolve(slowResponse(options.signal, true)));
    const execute = jest.fn((method, url, data, headers, signal, clientOptions) => sendRealRequestToCustomServer(method, url, data, headers, signal, clientOptions));
    const router = new ServerRouter({
        getServerAddresses: () => ["https://primary.test", "https://mirror.test", "https://third.test"],
        executeRequest: execute,
        loadState: async () => null,
        saveState: async () => undefined,
    });
    const result = router.request("GET", "/api/ota", {}, {}, { httpsOnly: true, retry: true, maxResponseBytes: OTA_MAX_BYTES, recordFailure: false, validateResponse: (response) => response.ok });
    await jest.advanceTimersByTimeAsync(30_000);
    expect((await result).ok).toBe(false);
    expect(execute).toHaveBeenCalledTimes(2);
});
