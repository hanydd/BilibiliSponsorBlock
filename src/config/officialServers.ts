import * as shipped from "../../ota/servers.json";
import { normalizeServerAddress } from "./serverConfig";

export interface OfficialServers {
    version: number;
    /** Request priority follows list order; kind only describes the address. */
    nodes: { id: string; address: string; kind: "primary" | "alias" | "mirror" }[];
}

export interface ServerPreferences {
    migratedFrom: "0.16.0";
    /** null follows the official primary; a string is always a manual choice. */
    primary: string | null;
    followOfficial: boolean;
    excludedIds: string[];
    added: string[];
}

export const builtinServers = normalizeOfficialServers(shipped.data as OfficialServers);

/** Keep stored addresses identical to the addresses used by the router and UI. */
export function normalizeOfficialServers(config: OfficialServers): OfficialServers {
    if (config.nodes.every((node) => node.address === normalizeServerAddress(node.address))) return config;
    return {
        ...config,
        nodes: config.nodes.map((node) => ({ ...node, address: normalizeServerAddress(node.address) })),
    };
}

export function normalizeServerPreferences(preferences: ServerPreferences): ServerPreferences {
    const primary = preferences.primary === null ? null : normalizeServerAddress(preferences.primary);
    const added = [...new Set(preferences.added.map(normalizeServerAddress))];
    if (primary === preferences.primary && added.length === preferences.added.length &&
        added.every((address, index) => address === preferences.added[index])) return preferences;
    return { ...preferences, primary, added };
}

export type ServerKind = "primary" | "mirror" | "alias" | "custom";

/** Server role is independent of whether the user manually saved its address. */
export function getServerKind(address: string, official: OfficialServers): ServerKind {
    const normalized = normalizeServerAddress(address);
    return official.nodes.find((node) => normalizeServerAddress(node.address) === normalized)?.kind ?? "custom";
}

export const SERVER_KIND_MESSAGE: Record<ServerKind, string> = {
    primary: "officialPrimaryServer",
    mirror: "officialMirrorServer",
    alias: "officialAliasServer",
    custom: "customMirrorServer",
};

export function isOfficialServers(value: unknown): value is OfficialServers {
    const validAddress = (address: unknown): address is string => {
        if (typeof address !== "string" || address.length > 2048) return false;
        try {
            const url = new URL(address);
            return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password &&
                !url.search && !url.hash && normalizeServerAddress(address) === url.origin;
        } catch { return false; }
    };
    if (!value || typeof value !== "object") return false;
    const config = value as OfficialServers;
    if ("primary" in config || !Number.isSafeInteger(config.version) || config.version < 1 ||
        !Array.isArray(config.nodes) || config.nodes.length > 32) return false;
    const ids = new Set<string>();
    const addresses = new Set<string>();
    return config.nodes.every((node) => {
        if (!node || typeof node.id !== "string" || !/^[\w-]{1,64}$/.test(node.id) || ids.has(node.id) ||
            !validAddress(node.address) || addresses.has(normalizeServerAddress(node.address)) ||
            !["primary", "alias", "mirror"].includes(node.kind)) return false;
        ids.add(node.id);
        addresses.add(normalizeServerAddress(node.address));
        return true;
    });
}

/** Frozen migration facts: never derive historical user choices from the current OTA bundle. */
const LEGACY_SERVERS_0160 = [
    {
        id: "official-alias",
        address: "https://bsbsb.cc",
        spellings: ["https://www.bsbsb.xyz", "https://bsbsb.xyz", "https://www.bsbsb.cc", "https://bsbsb.cc"],
    },
    {
        id: "official-mirror",
        address: "http://103.236.70.57:9876",
        spellings: ["http://103.236.70.57:9876"],
    },
] as const;

/** Old storage has no provenance. Recognize historical nodes, preserve other addresses. */
export function migrateServerPreferences(primary: string, mirrors: string[], configured: boolean): ServerPreferences {
    primary = normalizeServerAddress(primary);
    const officialPrimary = ["https://www.bsbsb.top", "https://bsbsb.top"].includes(primary);
    const known = new Map<string, { id: string; address: string }>();
    for (const node of LEGACY_SERVERS_0160) {
        for (const address of node.spellings) known.set(address, node);
    }
    const normalized = mirrors.map(normalizeServerAddress);
    const legacyDefault = officialPrimary && (!configured ||
        (normalized.length === 1 && normalized[0] === "http://103.236.70.57:9876"));
    return {
        migratedFrom: "0.16.0",
        primary: officialPrimary ? null : known.get(primary)?.address ?? primary,
        followOfficial: officialPrimary,
        excludedIds: legacyDefault ? [] : LEGACY_SERVERS_0160
            .filter((node) => !normalized.some((address) => known.get(address)?.id === node.id)).map((node) => node.id),
        added: configured ? normalized.filter((address) => !officialPrimary || !known.has(address))
            .map((address) => known.get(address)?.address ?? address) : [],
    };
}

export function resolveServers(official: OfficialServers, preferences: ServerPreferences) {
    const officialAddresses = official.nodes.filter((node) => !preferences.excludedIds.includes(node.id))
        .map((node) => normalizeServerAddress(node.address));
    const primary = preferences.primary === null ? officialAddresses[0] ?? "" : normalizeServerAddress(preferences.primary);
    const automatic = preferences.followOfficial ? officialAddresses : [];
    const mirrors = [...new Set([...automatic, ...preferences.added].map(normalizeServerAddress))]
        .filter((address) => address !== normalizeServerAddress(primary));
    return { primary, mirrors };
}
