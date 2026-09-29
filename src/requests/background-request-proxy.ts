import { FetchResponse } from "./type/requestType";
export { sendRealRequestToCustomServer } from "./backendTransport";
import { requestToBackend, BackendRequestOptions } from "./backendRouter";

export async function callAPI(
    type: string,
    endpoint: string,
    extraRequestData: Record<string, unknown> = {},
    skipServerCache: boolean = false,
    headers: Record<string, string> = {}
): Promise<FetchResponse> {
    return requestToBackend(type, endpoint, extraRequestData, { skipServerCache }, headers);
}

export async function callAPIWithOptions(
    type: string,
    endpoint: string,
    extraRequestData: Record<string, unknown> = {},
    options: BackendRequestOptions = {},
    headers: Record<string, string> = {}
): Promise<FetchResponse> {
    return requestToBackend(type, endpoint, extraRequestData, options, headers);
}
