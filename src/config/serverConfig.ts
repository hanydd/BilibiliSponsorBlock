import * as CompileConfig from "../../config.json";

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

export function isOfficialServerAddress(address: string): boolean {
    const officialPrimary = normalizeServerAddress(CompileConfig.serverAddress);
    const officialAddresses = new Set([
        officialPrimary,
        officialPrimary.replace("://www.", "://"),
        ...CompileConfig.mirrorServerAddresses.map(normalizeServerAddress),
    ]);

    return officialAddresses.has(normalizeServerAddress(address));
}

export function isOfficialMirrorServerAddress(address: string): boolean {
    const normalizedAddress = normalizeServerAddress(address);
    return CompileConfig.mirrorServerAddresses.some(
        (officialAddress) => normalizeServerAddress(officialAddress) === normalizedAddress
    );
}

export function usesDefaultMirrorServerAddresses(addresses: string[]): boolean {
    const configuredAddresses = addresses.map(normalizeServerAddress);
    const defaultAddresses = CompileConfig.mirrorServerAddresses.map(normalizeServerAddress);
    return (
        configuredAddresses.length === defaultAddresses.length &&
        configuredAddresses.every((address, index) => address === defaultAddresses[index])
    );
}

export function getMirrorServerAddressesAfterPrimaryChange(
    currentPrimaryAddress: string,
    nextPrimaryAddress: string,
    mirrorServerAddresses: string[]
): string[] {
    if (
        isOfficialServerAddress(currentPrimaryAddress) &&
        !isOfficialServerAddress(nextPrimaryAddress) &&
        usesDefaultMirrorServerAddresses(mirrorServerAddresses)
    ) {
        return [];
    }

    return mirrorServerAddresses;
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

export function getMigratedMirrorServerAddresses(
    serverAddress: string,
    mirrorServerAddresses: string[],
    mirrorServerAddressesWasConfigured: boolean
): string[] {
    if (!mirrorServerAddressesWasConfigured) {
        return isOfficialServerAddress(serverAddress) ? mirrorServerAddresses : [];
    }

    if (
        isOfficialServerAddress(serverAddress) &&
        mirrorServerAddresses.length === 1 &&
        normalizeServerAddress(mirrorServerAddresses[0]) === "http://103.236.70.57:9876"
    ) {
        return [...CompileConfig.mirrorServerAddresses];
    }

    return mirrorServerAddresses;
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
