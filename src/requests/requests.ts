import { FetchResponse } from "./type/requestType";

/**
 * Sends a request to a custom server
 *
 * @param type The request type. "GET", "POST", etc.
 * @param address The address to add to the SponsorBlock server address
 * @param callback
 */
function asyncRequestToCustomServer(
    type: string,
    endpoint: string,
    data = {},
    headers = {},
    backendId?: string
): Promise<FetchResponse> {
    return new Promise((resolve, reject) => {
        // Ask the background script to do the work
        chrome.runtime.sendMessage({ message: "sendRequest", type, endpoint, backendId, data, headers }, (response) => {
            if (response.status !== -1) {
                resolve(response);
            } else {
                reject(response);
            }
        });
    });
}

/**
 * Sends a request to the SponsorBlock server with address added as a query
 *
 * @param type The request type. "GET", "POST", etc.
 * @param address The address to add to the SponsorBlock server address
 * @param callback
 */
export async function asyncRequestToServer(
    type: string,
    address: string,
    data = {},
    ignoreServerCache = false,
    customHeaders = {},
    backendId?: string
): Promise<FetchResponse> {
    // Only add cache-related headers when explicitly skipping cache to avoid CORS preflight
    const headers = ignoreServerCache
        ? {
              "X-SKIP-CACHE": "1",
              ...customHeaders,
          }
        : customHeaders;

    return await asyncRequestToCustomServer(type, address, data, headers, backendId);
}

export async function asyncRequestToBackend(
    backendId: string,
    type: string,
    address: string,
    data = {},
    ignoreServerCache = false,
    customHeaders = {}
): Promise<FetchResponse> {
    return asyncRequestToServer(type, address, data, ignoreServerCache, customHeaders, backendId);
}

/**
 * Sends a request to the SponsorBlock server with address added as a query
 *
 * @param type The request type. "GET", "POST", etc.
 * @param address The address to add to the SponsorBlock server address
 * @param callback
 */
export function sendRequestToServer(type: string, address: string, callback?: (response: FetchResponse) => void): void {
    // Ask the background script to do the work
    chrome.runtime.sendMessage(
        {
            message: "sendRequest",
            type,
            endpoint: address,
        },
        (response) => {
            callback(response);
        }
    );
}
