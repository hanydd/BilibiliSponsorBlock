import * as CompileConfig from "../../config.json";
import { BackendConfig, BackendConfigDocument, VideoMatchContext, selectMatchedBackends } from "../backends";
import Config from "../config";
import { FetchResponse } from "./type/requestType";
import { sendRealRequestToCustomServer } from "./backendTransport";

export type BackendRequestDefinition = BackendConfig;

export type BackendConfigSnapshot = BackendConfigDocument;

export interface BackendRequestOptions {
    backendId?: string;
    skipServerCache?: boolean;
    videoContext?: VideoMatchContext;
}

const PATH_CAPABILITY_ALIASES: Array<[RegExp, string]> = [
    [/^\/api\/skipSegments(?:\/|$)/, "/api/skipSegments"],
    [/^\/api\/lockCategories(?:\/|$)/, "/api/lockCategories"],
    [/^\/api\/videoLabels(?:\/|$)/, "/api/videoLabels"],
    [/^\/api\/portVideo(?:\/|$)/, "/api/portVideo"],
    [/^\/api\/voteOnSponsorTime(?:\?|$)/, "/api/voteOnSponsorTime"],
    [/^\/api\/viewedVideoSponsorTime(?:\?|$)/, "/api/viewedVideoSponsorTime"],
    [/^\/api\/getUsername(?:\?|$)/, "/api/getUsername"],
    [/^\/api\/votePort(?:\/|\?|$)/, "/api/votePort"],
    [/^\/api\/updatePortedSegments(?:\/|\?|$)/, "/api/updatePortedSegments"],
    [/^\/api\/chapterNames(?:\/|\?|$)/, "/api/chapterNames"],
    [/^\/api\/userInfo(?:\/|\?|$)/, "/api/userInfo"],
    [/^\/api\/setUsername(?:\/|\?|$)/, "/api/setUsername"],
    [/^\/api\/warnUser(?:\/|\?|$)/, "/api/warnUser"],
    [/^\/api\/(votePort|updatePortedSegments|chapterNames|userInfo|setUsername|warnUser)(?:\/|\?|$)/, ""],
];

export function getCapabilityForEndpoint(endpoint: string): string {
    const alias = PATH_CAPABILITY_ALIASES.find(([pattern]) => pattern.test(endpoint));
    return alias?.[1] || endpoint.split("?")[0];
}

export function getConfiguredSnapshot(): BackendConfigSnapshot | null {
    const snapshot = Config.local?.backendConfig as BackendConfigSnapshot | undefined;
    if (!snapshot || !Array.isArray(snapshot.backends)) return null;
    const result = JSON.parse(JSON.stringify(snapshot)) as BackendConfigSnapshot;
    if (
        result.backends[0]?.id === "bsbsb" &&
        result.backends[0].api_url === CompileConfig.serverAddress &&
        Config.config?.serverAddress &&
        Config.config.serverAddress !== CompileConfig.serverAddress
    ) {
        result.backends[0].api_url = Config.config.serverAddress;
    }
    return result;
}

function isBackendEnabled(id: string): boolean {
    const map = (Config.local?.backendEnabledMap ?? {}) as Record<string, boolean>;
    return map[id] !== false;
}

export function getConfiguredBackends(): BackendRequestDefinition[] {
    return getConfiguredSnapshot()?.backends.filter((backend) => isBackendEnabled(backend.id)) ?? [];
}

export function getBackendById(id: string): BackendRequestDefinition | null {
    return getConfiguredBackends().find((backend) => backend.id === id) ?? null;
}

function getBaseUrl(backend: BackendRequestDefinition): string {
    const configured = backend.api_url.replace(/\/+$/, "");
    const isBuiltIn = backend.id === "bsbsb";
    return Config.config?.testingServer && isBuiltIn ? CompileConfig.testingServerAddress : configured;
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

export async function requestToBackend(
    type: string,
    endpoint: string,
    data: Record<string, unknown> = {},
    options: BackendRequestOptions = {},
    headers: Record<string, string> = {}
): Promise<FetchResponse> {
    const capability = getCapabilityForEndpoint(endpoint);
    const configuredBackends = options.videoContext
        ? selectMatchedBackends(
              getConfiguredSnapshot() ?? { backends: [] },
              options.videoContext,
              (Config.local?.backendEnabledMap ?? {}) as Record<string, boolean>
          )
        : getConfiguredBackends();
    const backend = options.backendId
        ? getBackendById(options.backendId)
        : configuredBackends.find((candidate) =>
              candidate.capabilities.includes(capability as BackendConfig["capabilities"][number])
          );
    if (backend) {
        if (!backend.capabilities.includes(capability as BackendConfig["capabilities"][number])) {
            return { responseText: "", status: 404, ok: false };
        }
        return requestFromBackend(backend, type, endpoint, data, Boolean(options.skipServerCache), headers);
    }

    if (options.backendId || getConfiguredSnapshot()) {
        return { responseText: "", status: 404, ok: false };
    }

    const legacyAddress = Config.config?.testingServer ? CompileConfig.testingServerAddress : Config.config?.serverAddress;
    if (!legacyAddress) return { responseText: "", status: -1, ok: false };
    return sendRealRequestToCustomServer(
        type,
        `${legacyAddress.replace(/\/+$/, "")}${endpoint}`,
        data,
        requestHeaders(Boolean(options.skipServerCache), headers)
    );
}
