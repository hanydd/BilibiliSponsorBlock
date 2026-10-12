import { objectToURI } from "../utils/";
import { FetchResponse } from "./type/requestType";
import { RequestClientOptions } from "./type/requestType";
import { readResponseText } from "./readResponseText";

/** Low-level background fetch shared by the legacy and multi-backend request paths. */
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

    const requestHeaders: Record<string, string> = { ...headers };
    if (data) requestHeaders["Content-Type"] = "application/json";
    if (Object.keys(headers).length > 0) requestHeaders["X-EXT-VERSION"] = chrome.runtime.getManifest().version;

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
            return { responseText: "", status: response.status, ok: false };
        }
    } else {
        responseText = await response.text();
    }
    return { responseText, status: response.status, ok: response.ok };
}
