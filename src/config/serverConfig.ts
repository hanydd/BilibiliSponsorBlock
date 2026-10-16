export const SERVER_ROUTER_STORAGE_KEY = "bsb_server_router_state";

export const SERVER_ROUTER_CONFIG = {
    backoffMs: [15 * 60 * 1000, 60 * 60 * 1000, 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000],
    recoveryProbeIntervalMs: 5 * 60 * 1000,
    hashRequestTimeoutMs: 6000,
    otherRequestTimeoutMs: 15000,
    healthCheckEndpoint: "/api/ready",
} as const;

const HASH_REQUEST_PATTERN = /^\/api\/(skipSegments|videoLabels)\/[^/?]+(?:\?.*)?$/;
const RETRYABLE_READ_REQUEST_PATTERNS = [
    /^\/api\/userInfo(?:\?.*)?$/,
    /^\/api\/getUsername(?:\?.*)?$/,
    /^\/api\/chapterNames(?:\?.*)?$/,
    /^\/api\/lockCategories\/[^/?]+(?:\?.*)?$/,
    /^\/api\/portVideo\/[^/?]+(?:\?.*)?$/,
];

export function normalizeServerAddress(address: string): string {
    return typeof address === "string" ? address.trim().replace(/\/+$/, "") : "";
}

export function addMirrorServerAddress(addresses: string[], address: string): string[] {
    const normalizedAddress = normalizeServerAddress(address);
    if (addresses.some((configuredAddress) => normalizeServerAddress(configuredAddress) === normalizedAddress)) {
        return addresses;
    }

    return [...addresses, normalizedAddress];
}

export function removeMirrorServerAddress(addresses: string[], address: string): string[] {
    const normalizedAddress = normalizeServerAddress(address);
    return addresses.filter(
        (configuredAddress) => normalizeServerAddress(configuredAddress) !== normalizedAddress
    );
}

export function isMergeableHashRequest(type: string, endpoint: string): boolean {
    return type === "GET" && HASH_REQUEST_PATTERN.test(endpoint);
}

export function isRetryableReadRequest(type: string, endpoint: string): boolean {
    return (
        type === "GET" &&
        (HASH_REQUEST_PATTERN.test(endpoint) ||
            RETRYABLE_READ_REQUEST_PATTERNS.some((pattern) => pattern.test(endpoint)))
    );
}
