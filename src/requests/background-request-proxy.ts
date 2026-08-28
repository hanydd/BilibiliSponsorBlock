import * as CompileConfig from "../../config.json";
import Config from "../config";
import { SERVER_ROUTER_STORAGE_KEY } from "../config/serverConfig";
import { objectToURI } from "../utils/";
import { ServerRouter, ServerRouterState } from "./serverRouter";
import { FetchResponse } from "./type/requestType";

/**
 * Sends a request to the specified url
 *
 * @param type The request type "GET", "POST", etc.
 * @param address The address to add to the SponsorBlock server address
 * @param callback
 */
export async function sendRealRequestToCustomServer(
    type: string,
    url: string,
    data: Record<string, unknown> | null = {},
    headers: Record<string, string> = {},
    signal?: AbortSignal
): Promise<FetchResponse> {
    // If GET, convert JSON to parameters
    if (type.toLowerCase() === "get") {
        url = objectToURI(url, data, true);

        data = null;
    }

    // only add headers when necessary
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

    if (response?.ok) {
        return {
            responseText: await response.text(),
            status: response.status,
            ok: response.ok,
        };
    } else {
        return { responseText: await response.text(), status: response.status, ok: false };
    }
}

async function getServerAddresses(): Promise<string[]> {
    await Config.ready;
    if (Config.config.testingServer) return [CompileConfig.testingServerAddress];

    return [
        Config.config.serverAddress,
        ...Config.config.mirrorServerAddresses,
    ];
}

export const serverRouter = new ServerRouter({
    getServerAddresses,
    executeRequest: (type, url, data, headers, signal) =>
        sendRealRequestToCustomServer(type, url, data, headers, signal),
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
    headers: Record<string, string> = {}
): Promise<FetchResponse> {
    if (skipServerCache) {
        headers = { ...headers };
        headers["X-SKIP-CACHE"] = "1";
        headers["cache-control"] = "no-cache";
    }

    return serverRouter.request(type, endpoint, extraRequestData, headers);
}
