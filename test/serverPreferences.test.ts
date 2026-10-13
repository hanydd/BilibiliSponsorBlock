/** @jest-environment node */
import Config from "../src/config";
import { builtinServers, getServerKind, isOfficialServers, migrateServerPreferences, resolveServers } from "../src/config/officialServers";
import {
    addServer, getEffectiveServers, getOfficialServers,
    removeServer, resetServerList, setPrimaryServer,
} from "../src/config/serverPreferences";

jest.mock("../src/config", () => ({
    __esModule: true,
    default: { ready: Promise.resolve(), config: {}, local: {} },
}));

const defaults = () => migrateServerPreferences(builtinServers.nodes[0].address, [], false);
const remote = (version = 2) => ({
    version,
    nodes: [
        { id: "official-primary", address: "https://primary.example", kind: "primary" as const },
        { id: "official-alias", address: "https://alias.example", kind: "alias" as const },
        { id: "new-mirror", address: "https://mirror.example", kind: "mirror" as const },
    ],
});

beforeEach(() => {
    Config.config.serverPreferences = defaults();
    Config.local.officialServers = null;
});

test.each([
    ["https://bsbsb.top", "primary"],
    ["http://103.236.70.57:9876", "mirror"],
    ["https://bsbsb.cc/", "alias"],
    ["https://user.example", "custom"],
    ["https://bsbsb.cc.example", "custom"],
])("classifies %s as %s", (address, kind) => {
    expect(getServerKind(address, builtinServers)).toBe(kind);
});

test("manual selection and primary position do not change the server role", () => {
    setPrimaryServer("https://bsbsb.cc");
    expect(getServerKind(getEffectiveServers().primary, getOfficialServers())).toBe("alias");
    expect(Config.config.serverPreferences.primary).toBe("https://bsbsb.cc");
    setPrimaryServer("https://user.example");
    expect(getServerKind(getEffectiveServers().primary, getOfficialServers())).toBe("custom");
});

test("classification follows the OTA snapshot rather than hardcoded domains", () => {
    expect(getServerKind(remote().nodes[0].address, remote())).toBe("primary");
    expect(getServerKind(remote().nodes[1].address, remote())).toBe("alias");
    expect(getServerKind(remote().nodes[2].address, remote())).toBe("mirror");
    expect(getServerKind("https://bsbsb.cc", remote())).toBe("custom");
});

test.each(["https://www.bsbsb.xyz", "https://bsbsb.xyz", "https://www.bsbsb.cc"])(
    "migrates legacy alias spelling %s to the canonical address", (address) => {
        const migrated = migrateServerPreferences("https://www.bsbsb.top", [address], true);
        expect(resolveServers(builtinServers, migrated)).toEqual({
            primary: "https://bsbsb.top", mirrors: ["https://bsbsb.cc"],
        });
    }
);

test("migrates 0.16.0 defaults, including the old IP-only default and trailing slashes", () => {
    for (const addresses of [
        ["https://www.bsbsb.xyz/", "http://103.236.70.57:9876"],
        ["http://103.236.70.57:9876"],
    ]) {
        const preferences = migrateServerPreferences("https://bsbsb.top/", addresses, true);
        expect(preferences).toEqual(defaults());
        expect(resolveServers(builtinServers, preferences).mirrors).toEqual(builtinServers.nodes.slice(1).map((node) => node.address));
    }
});

test("preserves explicit empty lists, custom additions and removed official IDs", () => {
    const empty = migrateServerPreferences(builtinServers.nodes[0].address, [], true);
    expect(resolveServers(builtinServers, empty).mirrors).toEqual([]);
    const mixed = migrateServerPreferences(builtinServers.nodes[0].address, ["https://www.bsbsb.xyz", "https://custom.example/"], true);
    expect(resolveServers(builtinServers, mixed).mirrors).toEqual(["https://bsbsb.cc", "https://custom.example"]);
    expect(mixed.excludedIds).toEqual(["official-mirror"]);
});

test("custom primaries never acquire official fallback servers during migration", () => {
    for (const configured of [true, false]) {
        const preferences = migrateServerPreferences("https://custom.example", ["https://user.example"], configured);
        expect(resolveServers(remote(), preferences)).toEqual({
            primary: "https://custom.example", mirrors: configured ? ["https://user.example"] : [],
        });
    }
});

test("official OTA replaces addresses and removes retired nodes without changing user preferences", () => {
    addServer("https://user.example");
    removeServer(builtinServers.nodes[1].address);
    const preferences = JSON.stringify(Config.config.serverPreferences);
    Config.local.officialServers = remote();
    expect(getEffectiveServers()).toEqual({ primary: remote().nodes[0].address, mirrors: ["https://mirror.example", "https://user.example"] });
    expect(JSON.stringify(Config.config.serverPreferences)).toBe(preferences);
    resetServerList();
    expect(getEffectiveServers().mirrors).toEqual(remote().nodes.slice(1).map((node) => node.address));
});

test("manually selected official addresses stay pinned across OTA, reset resumes following", () => {
    setPrimaryServer(builtinServers.nodes[0].address);
    addServer(builtinServers.nodes[1].address);
    Config.local.officialServers = remote();
    expect(getEffectiveServers().primary).toBe(builtinServers.nodes[0].address);
    expect(getEffectiveServers().mirrors).toContain(builtinServers.nodes[1].address);
    setPrimaryServer(null);
    expect(getEffectiveServers().primary).toBe(remote().nodes[0].address);
});

test("custom primary changes stop official fallback but retain manual additions", () => {
    addServer("https://user.example");
    setPrimaryServer("https://private.example");
    Config.local.officialServers = remote();
    expect(getEffectiveServers()).toEqual({ primary: "https://private.example", mirrors: ["https://user.example"] });
});

test("normalizes existing OTA snapshots in storage without needing a version update", () => {
    const snapshot = remote();
    snapshot.nodes[0].address += "/";
    snapshot.nodes[1].address += "/";
    Config.local.officialServers = snapshot;
    const normalized = getOfficialServers();
    expect(normalized.nodes.map((node) => node.address)).toEqual(remote().nodes.map((node) => node.address));
    expect(Config.local.officialServers).toBe(normalized);
    expect(getEffectiveServers()).toEqual({
        primary: normalized.nodes[0].address, mirrors: normalized.nodes.slice(1).map((node) => node.address),
    });
    expect(getOfficialServers()).toBe(normalized);
    expect(snapshot.nodes[1].address).toBe("https://alias.example/");
});

test.each(["https://alias.example", " https://alias.example/ "])(
    "removes OTA addresses by normalized spelling and preserves the exclusion after updates: %s", (address) => {
        const snapshot = remote();
        snapshot.nodes[1].address += "/";
        Config.local.officialServers = snapshot;
        removeServer(address);
        expect(Config.config.serverPreferences.excludedIds).toEqual(["official-alias"]);
        expect(getEffectiveServers().mirrors).toEqual(["https://mirror.example"]);
        const updated = remote(3);
        updated.nodes[1].address = "https://replacement-alias.example/";
        Config.local.officialServers = updated;
        expect(getEffectiveServers().mirrors).toEqual(["https://mirror.example"]);
    }
);

test("manual primary and fallback addresses are canonical and deduplicated when saved", () => {
    setPrimaryServer(" https://primary.example/ ");
    Config.config.serverPreferences.added = ["https://user.example/", "https://user.example"];
    addServer(" https://user.example/// ");
    expect(Config.config.serverPreferences.primary).toBe("https://primary.example");
    expect(Config.config.serverPreferences.added).toEqual(["https://user.example"]);
    expect(getEffectiveServers()).toEqual({ primary: "https://primary.example", mirrors: ["https://user.example"] });
    removeServer(" https://user.example/ ");
    expect(Config.config.serverPreferences.added).toEqual([]);
    expect(getEffectiveServers().mirrors).toEqual([]);
});

test.each([
    null, {}, { ...remote(), version: 0 }, { ...remote(), nodes: null },
    { ...remote(), primary: "https://legacy-separate-primary.example" },
    { ...remote(), nodes: [...remote().nodes, remote().nodes[0]] },
    { ...remote(), nodes: [{ id: "bad", address: "https://user:pass@example.org", kind: "mirror" }] },
    { ...remote(), nodes: [{ id: "bad", address: "javascript:alert(1)", kind: "alias" }] },
    { ...remote(), nodes: [{ id: "bad", address: "https://example.org/path", kind: "alias" }] },
    { ...remote(), nodes: [{ id: "bad", address: "https://example.org", kind: "unknown" }] },
])("rejects malformed feeds: %j", (value) => { expect(isOfficialServers(value)).toBe(false); });

test.each([
    [],
    [{ id: "one", address: "https://one.example", kind: "mirror" as const }],
    [
        { id: "one", address: "https://one.example", kind: "alias" as const },
        { id: "two", address: "https://two.example", kind: "alias" as const },
    ],
].map((nodes) => ({ nodes })))("migration works with any bundled address list: %j", ({ nodes }) => {
    const original = builtinServers.nodes;
    try {
        builtinServers.nodes = nodes;
        expect(isOfficialServers(builtinServers)).toBe(true);
        const migrated = migrateServerPreferences("https://bsbsb.top", ["https://www.bsbsb.xyz"], true);
        expect(migrated.excludedIds).toEqual(["official-mirror"]);
        expect(migrated.added).toEqual([]);
        expect(resolveServers(builtinServers, migrated)).toEqual({
            primary: nodes[0]?.address ?? "", mirrors: nodes.slice(1).map((node) => node.address),
        });
    } finally { builtinServers.nodes = original; }
});

test("new bundled addresses are not mistaken for historical user deletions", () => {
    const original = builtinServers.nodes;
    try {
        builtinServers.nodes = [...original, { id: "new", address: "https://new.example", kind: "mirror" }];
        const migrated = migrateServerPreferences("https://bsbsb.top", [], true);
        expect(migrated.excludedIds).toEqual(["official-alias", "official-mirror"]);
        expect(resolveServers(builtinServers, migrated).mirrors).toEqual(["https://new.example"]);
    } finally { builtinServers.nodes = original; }
});

test("request priority follows address order rather than type grouping", () => {
    const official = { version: 2, nodes: [remote().nodes[1], remote().nodes[0], remote().nodes[2]] };
    expect(resolveServers(official, defaults())).toEqual({
        primary: "https://alias.example", mirrors: ["https://primary.example", "https://mirror.example"],
    });
    expect(getServerKind("https://alias.example", official)).toBe("alias");
});

test("an empty official list preserves manual addresses without restoring retired nodes", () => {
    const preferences = { ...defaults(), added: ["https://user.example"] };
    expect(resolveServers({ version: 2, nodes: [] }, preferences)).toEqual({
        primary: "", mirrors: ["https://user.example"],
    });
    expect(resolveServers({ version: 2, nodes: [] }, { ...preferences, primary: "https://pinned.example" }))
        .toEqual({ primary: "https://pinned.example", mirrors: ["https://user.example"] });
});

