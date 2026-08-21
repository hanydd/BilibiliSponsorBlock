import { asyncRequestToServer } from "../requests/requests";
import { FetchResponse } from "../requests/type/requestType";
import {
    VideoMatchContext,
    getVideoMatchContextFromWindow,
    readPageVideoMatchContext,
} from "../utils/injectedScriptMessageUtils";
import { SponsorTime } from "../types";

export interface SubmissionBackend {
    id: string;
    name: string;
    desc?: string;
    capabilities?: string[];
    enabled?: boolean;
}

export type BackendSourcedSponsorTime = SponsorTime & { backendId?: string };

interface BackendRequestResponse<T> {
    value?: T;
    result?: T;
    backends?: SubmissionBackend[];
    backendId?: string | null;
}

function hasSkipSegmentsCapability(backend: SubmissionBackend): boolean {
    return !backend.capabilities || backend.capabilities.includes("/api/skipSegments");
}

function sendBackendServiceMessage<T>(message: string, payload: Record<string, unknown> = {}): Promise<T | null> {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        return Promise.resolve(null);
    }

    return new Promise((resolve) => {
        let settled = false;
        const finish = (value: T | null) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        const timeout = setTimeout(() => finish(null), 300);

        try {
            chrome.runtime.sendMessage(
                { message, method: message, ...payload },
                (response: T | BackendRequestResponse<T> | undefined) => {
                    clearTimeout(timeout);
                    if (response && typeof response === "object" && ("value" in response || "result" in response)) {
                        const wrapped = response as BackendRequestResponse<T>;
                        finish(wrapped.value ?? wrapped.result ?? null);
                    } else {
                        finish((response as unknown as T | undefined) ?? null);
                    }
                }
            );
        } catch (error) {
            clearTimeout(timeout);
            finish(null);
        }
    });
}

export async function getVideoMatchContext(): Promise<VideoMatchContext> {
    const pageContext = readPageVideoMatchContext();
    const windowContext = await getVideoMatchContextFromWindow();
    const mergedContext = {
        ...pageContext,
        ...windowContext,
    };

    if (Object.values(mergedContext).every((value) => value !== "")) {
        return mergedContext;
    }

    const serviceContext = await sendBackendServiceMessage<VideoMatchContext>("getVideoMatchContext", {
        context: mergedContext,
    });
    return {
        ...mergedContext,
        ...(serviceContext ?? {}),
    };
}

export async function getSubmissionBackends(context: VideoMatchContext): Promise<SubmissionBackend[]> {
    const response = await sendBackendServiceMessage<SubmissionBackend[] | BackendRequestResponse<SubmissionBackend[]>>(
        "getSubmissionBackends",
        { context }
    );
    const backends = Array.isArray(response)
        ? response
        : response && typeof response === "object" && Array.isArray(response.backends)
            ? response.backends
            : [];

    return backends.filter((backend) => Boolean(backend?.id) && backend.enabled !== false && hasSkipSegmentsCapability(backend));
}

export async function getLastSubmissionBackendId(): Promise<string | null> {
    const response = await sendBackendServiceMessage<string | BackendRequestResponse<string>>("getLastSubmissionBackendId");
    if (typeof response === "string") return response;
    return response?.backendId ?? null;
}

export async function setLastSubmissionBackendId(backendId: string): Promise<void> {
    await sendBackendServiceMessage("setLastSubmissionBackendId", { backendId });
}

/** Pass backendId through the request-core extension without coupling content code to its implementation. */
export function requestWithBackendId(
    type: string,
    endpoint: string,
    data: Record<string, unknown>,
    backendId?: string,
    ignoreServerCache = false
): Promise<FetchResponse> {
    type BackendAwareRequest = (
        type: string,
        endpoint: string,
        data: Record<string, unknown>,
        ignoreServerCache: boolean,
        customHeaders: Record<string, string>,
        backendId?: string
    ) => Promise<FetchResponse>;

    return (asyncRequestToServer as unknown as BackendAwareRequest)(
        type,
        endpoint,
        data,
        ignoreServerCache,
        {},
        backendId
    );
}

export function getBackendIdFromSegment(segment: SponsorTime | null | undefined): string | undefined {
    return (segment as BackendSourcedSponsorTime | null | undefined)?.backendId;
}
