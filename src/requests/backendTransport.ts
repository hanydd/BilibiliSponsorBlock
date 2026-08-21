import { objectToURI } from "../utils/";
import { FetchResponse } from "./type/requestType";

/** Low-level background fetch shared by the legacy and multi-backend request paths. */
export async function sendRealRequestToCustomServer(
    type: string,
    url: string,
    data: Record<string, unknown> | null = {},
    headers: Record<string, string> = {}
): Promise<FetchResponse> {
    if (type.toLowerCase() === "get") {
        url = objectToURI(url, data, true);
        data = null;
    }

    const requestHeaders: Record<string, string> = { ...headers };
    if (data) requestHeaders["Content-Type"] = "application/json";
    requestHeaders["X-EXT-VERSION"] = chrome.runtime.getManifest().version;

    const response = await fetch(url, {
        method: type,
        headers: requestHeaders,
        redirect: "follow",
        body: data ? JSON.stringify(data) : null,
    });

    const responseText = await response.text();
    return { responseText, status: response.status, ok: response.ok };
}
