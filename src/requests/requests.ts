import * as CompileConfig from "../../config.json";
import Config from "../config";
import { FetchResponse } from "./type/requestType";

/**
 * Sends a request to a custom server
 *
 * @param type The request type. "GET", "POST", etc.
 * @param address The address to add to the SponsorBlock server address
 * @param callback
 */
function asyncRequestToCustomServer(type: string, url: string, data = {}, headers = {}): Promise<FetchResponse> {
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
    customHeaders = {}
): Promise<FetchResponse> {
    const serverAddress = Config.config.testingServer
        ? CompileConfig.testingServerAddress
        : Config.config.serverAddress;

    return await asyncRequestToCustomServer(type, serverAddress + address, data, {
        "X-SKIP-CACHE": ignoreServerCache ? "1" : "0",
        ...customHeaders,
    });
}

/**
 * Sends a request to the SponsorBlock server with address added as a query
 *
 * @param type The request type. "GET", "POST", etc.
 * @param address The address to add to the SponsorBlock server address
 * @param callback
 */
export function sendRequestToServer(type: string, address: string, callback?: (response: FetchResponse) => void): void {
    const serverAddress = Config.config.testingServer
        ? CompileConfig.testingServerAddress
        : Config.config.serverAddress;

    // Ask the background script to do the work
    chrome.runtime.sendMessage(
        {
            message: "sendRequest",
            type,
            url: serverAddress + address,
        },
        (response) => {
            callback(response);
        }
    );
}
