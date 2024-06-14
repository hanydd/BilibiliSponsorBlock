import { objectToURI } from ".";
import { getHash } from "./hash";

export interface FetchResponse {
    responseText: string;
    status: number;
    ok: boolean;
}

/**
 * Sends a request to the specified url
 *
 * @param type The request type "GET", "POST", etc.
 * @param address The address to add to the SponsorBlock server address
 * @param callback
 */
export async function sendRealRequestToCustomServer(type: string, url: string,
        data: Record<string, unknown> | null = {}, ignoreServerCache = false) {
    // If GET, convert JSON to parameters
    if (type.toLowerCase() === "get") {
        url = objectToURI(url, data, true);

        data = null;
    }

    const response = await fetch(url, {
        method: type,
        headers: {
            'Content-Type': 'application/json',
            'X-SKIP-CACHE': ignoreServerCache ? '1' : '0'
        },
        redirect: 'follow',
        body: data ? JSON.stringify(data) : null
    });

    return response;
}

export function setupBackgroundRequestProxy() {
    chrome.runtime.onMessage.addListener((request, sender, callback) => {
        if (request.message === "sendRequest") {
            sendRealRequestToCustomServer(request.type, request.url, request.data, request.ignoreServerCache).then(async (response) => {
                callback({
                    responseText: await response.text(),
                    status: response.status,
                    ok: response.ok
                });
            }).catch(() => {
                callback({
                    responseText: "",
                    status: -1,
                    ok: false
                });
            });

            return true;
        }

        if (request.message === "getHash") {
            getHash(request.value, request.times).then(callback).catch((e) => {
                callback({
                    error: e?.message
                });
            });

            return true;
        }

        return false;
    });
}

export function sendRequestToCustomServer(type: string, url: string, data = {}, ignoreServerCache = false): Promise<FetchResponse> {
    return new Promise((resolve, reject) => {
        // Ask the background script to do the work
        chrome.runtime.sendMessage({
            message: "sendRequest",
            type,
            url,
            data,
            ignoreServerCache
        }, (response) => {
            if (response.status !== -1) {
                resolve(response);
            } else {
                reject(response);
            }
        });
    });
}