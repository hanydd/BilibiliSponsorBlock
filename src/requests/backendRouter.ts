import {
    BackendConfig,
    BackendConfigDocument,
    BackendOperation,
    BackendRequestCapability,
    VideoMatchContext,
    getBackendCapability,
    getBackendOperation,
    isBackendEnabled,
    selectMatchedBackends,
    supportsBackendOperation,
} from "../backends";
import Config from "../config";
import { FetchResponse } from "./type/requestType";
import { sendRealRequestToCustomServer } from "./backendTransport";

export type BackendRequestDefinition = BackendConfig;
export type BackendConfigSnapshot = BackendConfigDocument;

export interface BackendRequestOptions {
    backendId?: string;
    operation?: BackendOperation;
    skipServerCache?: boolean;
    videoContext?: VideoMatchContext;
}

export interface BackendRequestResult {
    backend: BackendRequestDefinition;
    backendId: string;
    priority: number;
    response: FetchResponse;
}

export function getCapabilityForEndpoint(endpoint: string, type = "GET"): BackendRequestCapability | null {
    const operation = getBackendOperation(type, endpoint);
    return operation ? getBackendCapability(operation) : null;
}

export function getConfiguredSnapshot(): BackendConfigSnapshot | null {
    const snapshot = Config.local?.backendConfig as BackendConfigSnapshot | undefined;
    if (!snapshot || !Array.isArray(snapshot.backends)) return null;
    return JSON.parse(JSON.stringify(snapshot)) as BackendConfigSnapshot;
}

function getEnabledMap(): Record<string, boolean> {
    return (Config.local?.backendEnabledMap ?? {}) as Record<string, boolean>;
}

export function getConfiguredBackends(): BackendRequestDefinition[] {
    return getConfiguredSnapshot()?.backends.filter((backend) => isBackendEnabled(backend, getEnabledMap())) ?? [];
}

export function getEligibleBackends(
    operation?: BackendOperation,
    videoContext?: VideoMatchContext
): BackendRequestDefinition[] {
    const configured = getConfiguredSnapshot();
    if (!configured) return [];

    const matched = videoContext
        ? selectMatchedBackends(configured, videoContext, getEnabledMap())
        : configured.backends.filter((backend) => isBackendEnabled(backend, getEnabledMap()));

    return operation ? matched.filter((backend) => supportsBackendOperation(backend, operation)) : matched;
}

export function getBackendById(
    id: string,
    operation?: BackendOperation,
    videoContext?: VideoMatchContext
): BackendRequestDefinition | null {
    return getEligibleBackends(operation, videoContext).find((backend) => backend.id === id) ?? null;
}

function getBaseUrl(backend: BackendRequestDefinition): string {
    return backend.api_url.replace(/\/+$/, "");
}

function requestHeaders(skipServerCache: boolean, headers: Record<string, string>): Record<string, string> {
    if (!skipServerCache) return { ...headers };
    return { "X-SKIP-CACHE": "1", "cache-control": "no-cache", ...headers };
}

function shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export async function requestFromBackend(
    backend: BackendRequestDefinition,
    type: string,
    endpoint: string,
    data: Record<string, unknown> = {},
    skipServerCache = false,
    headers: Record<string, string> = {}
): Promise<FetchResponse> {
    const addresses = [getBaseUrl(backend), ...(backend.mirrors ?? [])]
        .map((address) => address.replace(/\/+$/, ""))
        .filter((address, index, all) => Boolean(address) && all.indexOf(address) === index);
    let lastResponse: FetchResponse = { responseText: "", status: -1, ok: false };

    for (const address of [addresses[0], ...shuffle(addresses.slice(1))]) {
        if (!address) continue;
        try {
            const response = await sendRealRequestToCustomServer(
                type,
                `${address}${endpoint}`,
                data,
                requestHeaders(skipServerCache, headers)
            );
            lastResponse = response;
            if (response.ok) return response;
        } catch (error) {
            lastResponse = { responseText: error instanceof Error ? error.message : "", status: -1, ok: false };
        }
    }

    return lastResponse;
}

function resolveOperation(type: string, endpoint: string, options: BackendRequestOptions): BackendOperation | null {
    return options.operation ?? getBackendOperation(type, endpoint);
}

export async function requestFromBackends(
    type: string,
    endpoint: string,
    data: Record<string, unknown> = {},
    options: BackendRequestOptions = {},
    headers: Record<string, string> = {}
): Promise<BackendRequestResult[]> {
    const operation = resolveOperation(type, endpoint, options);
    if (!operation) return [];

    const backends = options.backendId
        ? [getBackendById(options.backendId, operation, options.videoContext)].filter(
              (backend): backend is BackendRequestDefinition => backend !== null
          )
        : getEligibleBackends(operation, options.videoContext);
    return Promise.all(
        backends.map(async (backend, priority) => ({
            backend,
            backendId: backend.id,
            priority,
            response: await requestFromBackend(
                backend,
                type,
                endpoint,
                data,
                Boolean(options.skipServerCache),
                headers
            ),
        }))
    );
}

export async function requestToBackend(
    type: string,
    endpoint: string,
    data: Record<string, unknown> = {},
    options: BackendRequestOptions = {},
    headers: Record<string, string> = {}
): Promise<FetchResponse> {
    const operation = resolveOperation(type, endpoint, options);
    if (!operation) return { responseText: "", status: 404, ok: false };

    const backend = options.backendId
        ? getBackendById(options.backendId, operation, options.videoContext)
        : getEligibleBackends(operation, options.videoContext)[0];
    if (!backend) return { responseText: "", status: 404, ok: false };

    return requestFromBackend(backend, type, endpoint, data, Boolean(options.skipServerCache), headers);
}
