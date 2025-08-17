import * as CompileConfig from "../../config.json";
import Config from "../config";
import { objectToURI } from "../utils/";
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
    headers: Record<string, string> = {}
) {
    // If GET, convert JSON to parameters
    if (type.toLowerCase() === "get") {
        url = objectToURI(url, data, true);

        data = null;
    }

    const response = await fetch(url, {
        method: type,
        headers: {
            "Content-Type": "application/json",
            "X-EXT-VERSION": chrome.runtime.getManifest().version,
            ...headers,
        },
        redirect: "follow",
        body: data ? JSON.stringify(data) : null,
    });

    return response;
}

export async function asyncRequestToServer(type: string, address: string, data = {}) {
    const serverAddress = getServerAddress();
    return await sendRealRequestToCustomServer(type, serverAddress + address, data);
}

export function sendRequestToCustomServer(type: string, url: string, data = {}, headers = {}): Promise<FetchResponse> {
    return new Promise((resolve, reject) => {
        // Ask the background script to do the work
        chrome.runtime.sendMessage({ message: "sendRequest", type, url, data, headers }, (response) => {
            if (response.status !== -1) {
                resolve(response);
            } else {
                reject(response);
            }
        });
    });
}

function getServerAddress(): string {
    return Config.config.testingServer ? CompileConfig.testingServerAddress : Config.config.serverAddress;
}

export async function callAPI(
    type: string,
    endpoint: string,
    extraRequestData: Record<string, unknown> = {},
    skipServerCache: boolean = false,
    headers: Record<string, string> = {}
): Promise<FetchResponse> {
    const url = `${getServerAddress()}${endpoint}`;

    if (skipServerCache) {
        headers["X-SKIP-CACHE"] = "1";
    }

    const response = await sendRealRequestToCustomServer(type, url, extraRequestData, headers);

    return {
        responseText: await response.text(),
        status: response.status,
        ok: response.ok,
    };
}
