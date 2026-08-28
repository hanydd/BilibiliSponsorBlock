import { FetchResponse } from "./type/requestType";
import {
    isMergeableHashRequest,
    isRetryableReadRequest,
    normalizeServerAddress,
    SERVER_ROUTER_CONFIG,
} from "../config/serverConfig";

interface NodeHealth {
    openUntil: number;
    backoffLevel: number;
    recoverySuccesses: number;
    nextRecoveryProbeAt: number;
    lastFailureAt: number;
}

export interface ServerRouterState {
    version: 1;
    nodeSignature: string;
    activeAddress: string;
    lastUnavailableProbeAddress: string;
    health: Record<string, NodeHealth>;
}

export interface ServerNodeStatus {
    address: string;
    active: boolean;
    state: "active" | "available" | "open" | "recovering";
    healthState: "available" | "open" | "recovering";
    openUntil: number;
    nextRecoveryProbeAt: number;
    recoverySuccesses: number;
}

export interface ServerRouterStatus {
    activeAddress: string;
    nodes: ServerNodeStatus[];
}

export interface ServerAddressCheckResult {
    address: string;
    healthState: "available" | "open";
}

type RequestData = Record<string, unknown> | null;
type RetryMode = "none" | "single" | "all";

interface ServerRouterOptions {
    getServerAddresses: () => string[] | Promise<string[]>;
    executeRequest: (
        type: string,
        url: string,
        data: RequestData,
        headers: Record<string, string>,
        signal: AbortSignal
    ) => Promise<FetchResponse>;
    loadState: () => Promise<ServerRouterState | null>;
    saveState: (state: ServerRouterState) => Promise<void>;
    now?: () => number;
    random?: () => number;
    hashRequestTimeoutMs?: number;
    otherRequestTimeoutMs?: number;
}

interface RequestSelection {
    address: string;
    recoveryProbe: boolean;
}

function emptyState(): ServerRouterState {
    return {
        version: 1,
        nodeSignature: "",
        activeAddress: "",
        lastUnavailableProbeAddress: "",
        health: {},
    };
}

function failedResponse(): FetchResponse {
    return { responseText: "", status: -1, ok: false };
}

export class ServerRouter {
    private readonly options: ServerRouterOptions;
    private readonly now: () => number;
    private readonly random: () => number;
    private readonly inFlightHashRequests = new Map<string, Promise<FetchResponse>>();
    private readonly recoveryProbesInFlight = new Set<string>();
    private state = emptyState();
    private loadPromise: Promise<void> | null = null;

    constructor(options: ServerRouterOptions) {
        this.options = options;
        this.now = options.now ?? Date.now;
        this.random = options.random ?? Math.random;
    }

    async request(
        type: string,
        endpoint: string,
        data: RequestData = {},
        headers: Record<string, string> = {}
    ): Promise<FetchResponse> {
        const normalizedType = type.toUpperCase();
        const mergeHashRequest = isMergeableHashRequest(normalizedType, endpoint);
        const retryMode: RetryMode = mergeHashRequest
            ? "all"
            : isRetryableReadRequest(normalizedType, endpoint)
              ? "single"
              : "none";

        if (!mergeHashRequest) {
            return this.routeRequest(normalizedType, endpoint, data, headers, retryMode);
        }

        const requestKey = this.getHashRequestKey(normalizedType, endpoint, data, headers);
        const existingRequest = this.inFlightHashRequests.get(requestKey);
        if (existingRequest) return existingRequest;

        const request = this.routeRequest(normalizedType, endpoint, data, headers, retryMode);
        this.inFlightHashRequests.set(requestKey, request);

        try {
            return await request;
        } finally {
            if (this.inFlightHashRequests.get(requestKey) === request) {
                this.inFlightHashRequests.delete(requestKey);
            }
        }
    }

    async getStatus(): Promise<ServerRouterStatus> {
        const addresses = await this.getAddresses();
        const now = this.now();

        return {
            activeAddress: this.state.activeAddress,
            nodes: addresses.map((address) => {
                const health = this.state.health[address];
                const active = address === this.state.activeAddress;
                let healthState: ServerNodeStatus["healthState"] = "available";

                if (health?.openUntil > now) {
                    healthState = "open";
                } else if (health?.backoffLevel > 0) {
                    healthState = "recovering";
                }

                return {
                    address,
                    active,
                    state: active ? "active" : healthState,
                    healthState,
                    openUntil: health?.openUntil ?? 0,
                    nextRecoveryProbeAt: health?.nextRecoveryProbeAt ?? 0,
                    recoverySuccesses: health?.recoverySuccesses ?? 0,
                };
            }),
        };
    }

    async probe(address: string): Promise<ServerRouterStatus> {
        const addresses = await this.getAddresses();
        const normalizedAddress = normalizeServerAddress(address);
        if (!addresses.includes(normalizedAddress)) return this.getStatus();

        const result = await this.checkAddress(normalizedAddress);
        if (result.healthState === "open") {
            await this.recordFailure(normalizedAddress, addresses, true);
        } else {
            await this.recordRequestSuccess(normalizedAddress);
        }

        return this.getStatus();
    }

    async checkAddress(address: string): Promise<ServerAddressCheckResult> {
        const normalizedAddress = normalizeServerAddress(address);
        const response = await this.execute(
            "GET",
            normalizedAddress + SERVER_ROUTER_CONFIG.healthCheckEndpoint,
            {},
            {},
            true
        );

        return {
            address: normalizedAddress,
            healthState: this.isProbeFailure(response) ? "open" : "available",
        };
    }

    private async routeRequest(
        type: string,
        endpoint: string,
        data: RequestData,
        headers: Record<string, string>,
        retryMode: RetryMode
    ): Promise<FetchResponse> {
        const addresses = await this.getAddresses();
        if (addresses.length === 0) return failedResponse();

        const retryRequest = retryMode !== "none";
        const validateHashResponse = retryMode === "all";
        const selection = await this.selectRequestNode(addresses, retryRequest);
        const response = await this.execute(type, selection.address + endpoint, data, headers, validateHashResponse);

        if (!retryRequest) {
            if (this.isNodeFailure(response)) {
                await this.recordFailure(selection.address, addresses, true);
            } else {
                await this.recordRequestSuccess(selection.address);
            }
            return response;
        }

        if (selection.recoveryProbe) {
            try {
                if (this.isRetryableResponse(response, validateHashResponse)) {
                    await this.recordFailure(selection.address, addresses, false);
                    return (
                        (await this.retryRequestOnAvailableNodes(
                            type,
                            endpoint,
                            data,
                            headers,
                            addresses,
                            new Set([selection.address]),
                            retryMode,
                            validateHashResponse
                        )) ?? response
                    );
                } else if (this.isUsableResponse(response, validateHashResponse)) {
                    await this.recordRequestSuccess(selection.address);
                } else {
                    await this.postponeRecoveryProbe(selection.address);
                }
                return response;
            } finally {
                this.recoveryProbesInFlight.delete(selection.address);
            }
        }

        if (!this.isRetryableResponse(response, validateHashResponse)) {
            if (this.isUsableResponse(response, validateHashResponse)) {
                await this.recordRequestSuccess(selection.address);
            }
            return response;
        }

        await this.recordFailure(selection.address, addresses, false);
        return (
            (await this.retryRequestOnAvailableNodes(
                type,
                endpoint,
                data,
                headers,
                addresses,
                new Set([selection.address]),
                retryMode,
                validateHashResponse
            )) ?? response
        );
    }

    private async retryRequestOnAvailableNodes(
        type: string,
        endpoint: string,
        data: RequestData,
        headers: Record<string, string>,
        addresses: string[],
        attemptedAddresses: Set<string>,
        retryMode: RetryMode,
        validateHashResponse: boolean
    ): Promise<FetchResponse | null> {
        const retryLimit = retryMode === "all" ? addresses.length : 1;
        let retryCount = 0;
        let lastResponse: FetchResponse | null = null;
        let address = this.findAvailableNode(addresses, attemptedAddresses);
        while (address && retryCount < retryLimit) {
            attemptedAddresses.add(address);
            retryCount += 1;

            const response = await this.execute(type, address + endpoint, data, headers, validateHashResponse);
            lastResponse = response;
            if (this.isRetryableResponse(response, validateHashResponse)) {
                await this.recordFailure(address, addresses, false);
                address = this.findAvailableNode(addresses, attemptedAddresses);
                continue;
            }

            if (this.isUsableResponse(response, validateHashResponse)) {
                await this.setActiveNode(address);
                await this.recordRequestSuccess(address);
            }
            return response;
        }

        return lastResponse;
    }

    private async execute(
        type: string,
        url: string,
        data: RequestData,
        headers: Record<string, string>,
        hashRequest: boolean
    ): Promise<FetchResponse> {
        const controller = new AbortController();
        const timeoutMs = hashRequest
            ? (this.options.hashRequestTimeoutMs ?? SERVER_ROUTER_CONFIG.hashRequestTimeoutMs)
            : (this.options.otherRequestTimeoutMs ?? SERVER_ROUTER_CONFIG.otherRequestTimeoutMs);
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            return await this.options.executeRequest(type, url, data, headers, controller.signal);
        } catch {
            return failedResponse();
        } finally {
            clearTimeout(timeout);
        }
    }

    private async selectRequestNode(addresses: string[], allowRecoveryProbe: boolean): Promise<RequestSelection> {
        const activeIndex = addresses.indexOf(this.state.activeAddress);
        const normalizedActiveIndex = activeIndex >= 0 ? activeIndex : 0;

        if (allowRecoveryProbe && normalizedActiveIndex > 0) {
            const recoveryAddress = addresses
                .slice(0, normalizedActiveIndex)
                .find((address) => !this.recoveryProbesInFlight.has(address) && this.isRecoveryProbeDue(address));
            if (recoveryAddress) {
                this.recoveryProbesInFlight.add(recoveryAddress);
                return { address: recoveryAddress, recoveryProbe: true };
            }
        }

        const activeAddress = addresses[normalizedActiveIndex];
        if (this.isHealthy(activeAddress)) return { address: activeAddress, recoveryProbe: false };

        const availableAddress = this.findAvailableNode(addresses, new Set());
        if (availableAddress) {
            await this.setActiveNode(availableAddress);
            return { address: availableAddress, recoveryProbe: false };
        }

        return {
            address: await this.selectNextUnavailableNode(addresses),
            recoveryProbe: false,
        };
    }

    private async selectNextUnavailableNode(addresses: string[]): Promise<string> {
        const previousIndex = addresses.indexOf(this.state.lastUnavailableProbeAddress);
        const activeIndex = addresses.indexOf(this.state.activeAddress);
        const startIndex = previousIndex >= 0 ? previousIndex : activeIndex >= 0 ? activeIndex : 0;
        const address = addresses[(startIndex + 1) % addresses.length];

        if (this.state.lastUnavailableProbeAddress !== address) {
            this.state.lastUnavailableProbeAddress = address;
            await this.persistState();
        }

        return address;
    }

    private isRecoveryProbeDue(address: string): boolean {
        const health = this.state.health[address];
        if (!health || health.backoffLevel === 0 || health.openUntil > this.now()) return false;
        return health.nextRecoveryProbeAt <= this.now();
    }

    private findAvailableNode(addresses: string[], excluded: Set<string>): string | null {
        return addresses.find((address) => !excluded.has(address) && this.isHealthy(address)) ?? null;
    }

    private isHealthy(address: string): boolean {
        return (this.state.health[address]?.backoffLevel ?? 0) === 0;
    }

    private async recordFailure(address: string, addresses: string[], switchActiveNode: boolean): Promise<void> {
        const now = this.now();
        const health = this.getNodeHealth(address);
        let changed = false;

        if (health.openUntil <= now) {
            const level = Math.min(health.backoffLevel, SERVER_ROUTER_CONFIG.backoffMs.length - 1);
            const jitter = 0.9 + this.random() * 0.2;

            health.openUntil = now + Math.round(SERVER_ROUTER_CONFIG.backoffMs[level] * jitter);
            health.backoffLevel = Math.min(level + 1, SERVER_ROUTER_CONFIG.backoffMs.length - 1);
            health.recoverySuccesses = 0;
            health.nextRecoveryProbeAt = health.openUntil;
            health.lastFailureAt = now;
            changed = true;
        }

        if (switchActiveNode && this.state.activeAddress === address) {
            const alternative = this.findAvailableNode(addresses, new Set([address]));
            if (alternative) {
                this.state.activeAddress = alternative;
                changed = true;
            }
        }

        if (changed) await this.persistState();
    }

    private async recordRecoverySuccess(address: string): Promise<void> {
        const health = this.getNodeHealth(address);
        health.openUntil = 0;
        health.recoverySuccesses += 1;

        if (health.recoverySuccesses < 2) {
            health.nextRecoveryProbeAt = this.now() + SERVER_ROUTER_CONFIG.recoveryProbeIntervalMs;
        } else {
            this.state.health[address] = this.createNodeHealth();
            this.state.activeAddress = address;
        }

        await this.persistState();
    }

    private async postponeRecoveryProbe(address: string): Promise<void> {
        const health = this.getNodeHealth(address);
        health.nextRecoveryProbeAt = this.now() + SERVER_ROUTER_CONFIG.recoveryProbeIntervalMs;
        await this.persistState();
    }

    private async recordRequestSuccess(address: string): Promise<void> {
        const health = this.state.health[address];
        if (!health || health.backoffLevel === 0) return;
        if (health.recoverySuccesses > 0 && health.nextRecoveryProbeAt > this.now()) return;

        await this.recordRecoverySuccess(address);
    }

    private async setActiveNode(address: string): Promise<void> {
        if (this.state.activeAddress === address) return;
        this.state.activeAddress = address;
        await this.persistState();
    }

    private getNodeHealth(address: string): NodeHealth {
        if (!this.state.health[address]) this.state.health[address] = this.createNodeHealth();
        return this.state.health[address];
    }

    private createNodeHealth(): NodeHealth {
        return {
            openUntil: 0,
            backoffLevel: 0,
            recoverySuccesses: 0,
            nextRecoveryProbeAt: 0,
            lastFailureAt: 0,
        };
    }

    private isRetryableHashFailure(response: FetchResponse): boolean {
        if (this.isNodeFailure(response)) return true;
        if (response.status !== 200) return false;

        try {
            JSON.parse(response.responseText);
            return false;
        } catch {
            return true;
        }
    }

    private isRetryableResponse(response: FetchResponse, validateHashResponse: boolean): boolean {
        return validateHashResponse ? this.isRetryableHashFailure(response) : this.isNodeFailure(response);
    }

    private isProbeFailure(response: FetchResponse): boolean {
        return !response.ok;
    }

    private isNodeFailure(response: FetchResponse): boolean {
        return response.status === -1 || response.status === 408 || response.status >= 500;
    }

    private isUsableHashResponse(response: FetchResponse): boolean {
        return response.status === 404 || (response.status === 200 && !this.isRetryableHashFailure(response));
    }

    private isUsableResponse(response: FetchResponse, validateHashResponse: boolean): boolean {
        return validateHashResponse
            ? this.isUsableHashResponse(response)
            : response.ok || response.status === 404;
    }

    private getHashRequestKey(
        type: string,
        endpoint: string,
        data: RequestData,
        headers: Record<string, string>
    ): string {
        const sortedHeaders = Object.keys(headers)
            .sort()
            .map((key) => [key, headers[key]]);
        return JSON.stringify([type, endpoint, data, sortedHeaders]);
    }

    private async getAddresses(): Promise<string[]> {
        await this.ensureLoaded();
        const configuredAddresses = await this.options.getServerAddresses();
        const addresses = [...new Set(configuredAddresses.map(normalizeServerAddress).filter(Boolean))];
        const signature = addresses.join("\n");

        if (signature !== this.state.nodeSignature) {
            const previousActiveAddress = this.state.activeAddress;
            const health = Object.fromEntries(
                addresses
                    .filter((address) => this.state.health[address])
                    .map((address) => [address, this.state.health[address]])
            );
            this.state = {
                ...emptyState(),
                nodeSignature: signature,
                activeAddress: addresses.includes(previousActiveAddress) ? previousActiveAddress : "",
                health,
            };
            if (!this.state.activeAddress) {
                this.state.activeAddress = this.findAvailableNode(addresses, new Set()) ?? addresses[0] ?? "";
            }
            await this.persistState();
        } else if (!addresses.includes(this.state.activeAddress)) {
            this.state.activeAddress = this.findAvailableNode(addresses, new Set()) ?? addresses[0] ?? "";
            await this.persistState();
        }

        return addresses;
    }

    private async ensureLoaded(): Promise<void> {
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = this.options.loadState().then((state) => {
            if (state?.version === 1) this.state = { ...emptyState(), ...state };
        });
        return this.loadPromise;
    }

    private async persistState(): Promise<void> {
        await this.options.saveState(this.state);
    }
}
