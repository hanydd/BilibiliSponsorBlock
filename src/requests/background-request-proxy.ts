import * as CompileConfig from "../../config.json";
import Config from "../config";
import { getEffectiveServers } from "../config/serverPreferences";
import { SERVER_ROUTER_STORAGE_KEY } from "../config/serverConfig";
import { readResponseText } from "./readResponseText";
import { objectToURI } from "../utils/";
import { ServerRouter } from "./serverRouter";
import type { ServerRouterState } from "./serverRouter";
import type { RequestClientOptions } from "./type/requestType";
import { FetchResponse } from "./type/requestType";

/** 后台 HTTP 传输：GET 数据编码为查询参数，其他方法使用 JSON 请求体。 */
export async function sendRealRequestToCustomServer(
    type: string,
    url: string,
    data: Record<string, unknown> | null = {},
    headers: Record<string, string> = {},
    signal?: AbortSignal,
    clientOptions: RequestClientOptions = {}
): Promise<FetchResponse> {
    if (type.toLowerCase() === "get") {
        url = objectToURI(url, data, true);

        data = null;
    }

    const requestHeaders: Record<string, string> = {
        ...headers,
    };
    if (data) {
        requestHeaders["Content-Type"] = "application/json";
    }
    if (Object.keys(headers).length > 0) {
        requestHeaders["X-EXT-VERSION"] = chrome.runtime.getManifest().version;
    }

    const response = await fetch(url, {
        method: type,
        headers: requestHeaders,
        redirect: "follow",
        body: data ? JSON.stringify(data) : null,
        signal,
    });

    let responseText: string;
    if (clientOptions.maxResponseBytes !== undefined) {
        try {
            responseText = await readResponseText(response, clientOptions.maxResponseBytes);
        } catch (error) {
            if (signal?.aborted) throw error;
            // 保留已收到的 HTTP 状态；正文读取失败由路由的校验、重试和失败记录策略处理。
            return { responseText: "", status: response.status, ok: false };
        }
    } else {
        responseText = await response.text();
    }
    return { responseText, status: response.status, ok: response.ok };
}

async function getServerAddresses(): Promise<string[]> {
    await Config.ready;
    if (Config.config.testingServer) return [CompileConfig.testingServerAddress];

    const servers = getEffectiveServers();
    return [servers.primary, ...servers.mirrors];
}

export const serverRouter = new ServerRouter({
    getServerAddresses,
    executeRequest: (type, url, data, headers, signal, clientOptions) =>
        sendRealRequestToCustomServer(type, url, data, headers, signal, clientOptions),
    loadState: () =>
        new Promise((resolve) => {
            chrome.storage.local.get(SERVER_ROUTER_STORAGE_KEY, (items) => {
                resolve((items?.[SERVER_ROUTER_STORAGE_KEY] as ServerRouterState) ?? null);
            });
        }),
    saveState: (state) =>
        new Promise((resolve) => {
            chrome.storage.local.set({ [SERVER_ROUTER_STORAGE_KEY]: state }, resolve);
        }),
});

export async function callAPI(
    type: string,
    endpoint: string,
    extraRequestData: Record<string, unknown> = {},
    skipServerCache: boolean = false,
    headers: Record<string, string> = {},
    clientOptions: RequestClientOptions = {}
): Promise<FetchResponse> {
    if (skipServerCache) {
        headers = { ...headers };
        headers["X-SKIP-CACHE"] = "1";
        headers["cache-control"] = "no-cache";
    }

    return serverRouter.request(type, endpoint, extraRequestData, headers, clientOptions);
}
