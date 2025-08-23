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
): Promise<FetchResponse> {
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

    return response;
}
