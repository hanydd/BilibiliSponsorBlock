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
} from "../backends";
import Config from "../config";
import { FetchResponse } from "./type/requestType";
import { sendRealRequestToCustomServer } from "./backendTransport";
import {
    BackendAddressCheckResult,
    BackendRouterState,
    BackendRouterStatus,
    ServerRouter,
} from "./serverRouter";

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

export const BACKEND_ROUTER_STORAGE_KEY = "bsb_backend_router_state";

interface BackendRouterStorage {
    version: 1;
    backends: Record<string, BackendRouterState>;
}

const routers = new Map<string, ServerRouter>();
const persistedStates = new Map<string, BackendRouterState>();
let persistedStatesLoaded: Promise<void> | null = null;

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
    return selectMatchedBackends(configured, videoContext, getEnabledMap(), operation);
}

export function getBackendById(
    id: string,
    operation?: BackendOperation,
    videoContext?: VideoMatchContext
): BackendRequestDefinition | null {
    return getEligibleBackends(operation, videoContext).find((backend) => backend.id === id) ?? null;
}

function requestHeaders(skipServerCache: boolean, headers: Record<string, string>): Record<string, string> {
    if (!skipServerCache) return { ...headers };
    return { "X-SKIP-CACHE": "1", "cache-control": "no-cache", ...headers };
}

async function loadPersistedStates(): Promise<void> {
    if (persistedStatesLoaded) return persistedStatesLoaded;
    persistedStatesLoaded = new Promise((resolve) => {
        if (typeof chrome === "undefined" || !chrome.storage?.local) {
            resolve();
            return;
        }
        chrome.storage.local.get(BACKEND_ROUTER_STORAGE_KEY, (items) => {
            const storage = items?.[BACKEND_ROUTER_STORAGE_KEY] as BackendRouterStorage | undefined;
            if (storage?.version === 1 && storage.backends && typeof storage.backends === "object") {
                for (const [backendId, state] of Object.entries(storage.backends)) {
                    if (state?.version === 1 && state.backendId === backendId) persistedStates.set(backendId, state);
                }
            }
            resolve();
        });
    });
    return persistedStatesLoaded;
}

async function savePersistedState(state: BackendRouterState): Promise<void> {
    persistedStates.set(state.backendId, state);
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    await new Promise<void>((resolve) => {
        chrome.storage.local.set(
            {
                [BACKEND_ROUTER_STORAGE_KEY]: {
                    version: 1,
                    backends: Object.fromEntries(persistedStates),
                } satisfies BackendRouterStorage,
            },
            resolve
        );
    });
}

function getBackendDefinition(id: string, fallback?: BackendRequestDefinition): BackendRequestDefinition | null {
    return getConfiguredSnapshot()?.backends.find((backend) => backend.id === id) ?? fallback ?? null;
}

async function getRouter(backend: BackendRequestDefinition): Promise<ServerRouter> {
    const existing = routers.get(backend.id);
    if (existing) return existing;

    await loadPersistedStates();
    const router = new ServerRouter({
        backendId: backend.id,
        getServerAddresses: () => {
            const current = getBackendDefinition(backend.id, backend);
            return current ? [current.api_url, ...(current.mirrors ?? [])] : [];
        },
        executeRequest: (type, url, data, headers, signal) =>
            sendRealRequestToCustomServer(type, url, data, headers, signal),
        loadState: () => Promise.resolve(persistedStates.get(backend.id) ?? null),
        saveState: savePersistedState,
    });
    routers.set(backend.id, router);
    return router;
}

export async function getBackendStatus(backendId: string): Promise<BackendRouterStatus> {
    const backend = getBackendDefinition(backendId);
    if (!backend) return { backendId, activeAddress: "", nodes: [] };
    return (await getRouter(backend)).getStatus();
}

export async function probeBackendNode(backendId: string, address: string): Promise<BackendRouterStatus> {
    const backend = getBackendDefinition(backendId);
    if (!backend) return { backendId, activeAddress: "", nodes: [] };
    return (await getRouter(backend)).probe(address);
}

export async function checkBackendAddress(backendId: string, address: string): Promise<BackendAddressCheckResult> {
    const backend = getBackendDefinition(backendId);
    if (!backend) return { backendId, address, healthState: "open" };
    return (await getRouter(backend)).checkAddress(address);
}

export async function requestFromBackend(
    backend: BackendRequestDefinition,
    type: string,
    endpoint: string,
    data: Record<string, unknown> = {},
    skipServerCache = false,
    headers: Record<string, string> = {}
): Promise<FetchResponse> {
    const router = await getRouter(backend);
    return router.request(type, endpoint, data, requestHeaders(skipServerCache, headers));
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
