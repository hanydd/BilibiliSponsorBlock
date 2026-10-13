import Config from "../config";
import {
    builtinServers, isOfficialServers, normalizeOfficialServers, normalizeServerPreferences,
    resolveServers, OfficialServers,
} from "./officialServers";
import { normalizeServerAddress } from "./serverConfig";

export function getOfficialServers(): OfficialServers {
    const remote = Config.local?.officialServers;
    if (!isOfficialServers(remote) || remote.version <= builtinServers.version) return builtinServers;
    const normalized = normalizeOfficialServers(remote);
    // Repair snapshots saved before address normalization was enforced, without waiting for a newer OTA version.
    if (normalized !== remote) Config.local.officialServers = normalized;
    return normalized;
}

export function getEffectiveServers() {
    return resolveServers(getOfficialServers(), Config.config.serverPreferences);
}

export function setPrimaryServer(address: string | null): void {
    if (address !== null) address = normalizeServerAddress(address);
    const preferences = Config.config.serverPreferences;
    const official = getOfficialServers();
    const isOfficial = address === null || official.nodes.map((node) => normalizeServerAddress(node.address))
        .includes(normalizeServerAddress(address));
    Config.config.serverPreferences = normalizeServerPreferences({
        ...preferences, primary: address,
        followOfficial: isOfficial,
    });
}

export function addServer(address: string): void {
    const preferences = Config.config.serverPreferences;
    Config.config.serverPreferences = normalizeServerPreferences({
        ...preferences, added: [...new Set([...preferences.added, normalizeServerAddress(address)])],
    });
}

export function removeServer(address: string): void {
    address = normalizeServerAddress(address);
    const preferences = Config.config.serverPreferences;
    const node = getOfficialServers().nodes.find((node) => normalizeServerAddress(node.address) === address);
    Config.config.serverPreferences = normalizeServerPreferences({
        ...preferences,
        added: preferences.added.filter((item) => normalizeServerAddress(item) !== address),
        excludedIds: node ? [...new Set([...preferences.excludedIds, node.id])] : preferences.excludedIds,
    });
}

export function resetServerList(): void {
    Config.config.serverPreferences = {
        ...Config.config.serverPreferences, followOfficial: true, excludedIds: [], added: [],
    };
}

