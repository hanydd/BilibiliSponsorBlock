/** @jest-environment node */
import type { ServerPreferences } from "../src/config/officialServers";

jest.mock("../src/utils/", () => ({ isFirefox: () => false }));

async function loadConfig(sync: Record<string, unknown>, local: Record<string, unknown> = {}) {
    jest.resetModules();
    jest.useFakeTimers();
    const clone = (value: unknown) => JSON.parse(JSON.stringify(value));
    let onChanged: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
    const emit = (values: Record<string, unknown>, area: string) => onChanged(
        Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }])), area
    );
    const syncWrites: Record<string, unknown>[] = [];
    const localWrites: Record<string, unknown>[] = [];
    const storageArea = (stored: Record<string, unknown>, writes: Record<string, unknown>[], area: string) => ({
        get: (_keys, done) => done(clone(stored)),
        set: (items, done = () => undefined) => {
            const values = clone(items);
            writes.push(values);
            Object.assign(stored, values);
            emit(values, area);
            done();
        },
        remove: (key) => { delete stored[String(key)]; },
    });
    global.chrome = {
        runtime: {},
        storage: {
            onChanged: { addListener: listener => { onChanged = listener; } },
            sync: storageArea(sync, syncWrites, "sync"),
            local: storageArea(local, localWrites, "local"),
        },
    } as unknown as typeof chrome;
    const Config = (await import("../src/config")).default;
    await Config.ready;
    jest.runOnlyPendingTimers();
    const servers = await import("../src/config/serverPreferences");
    return { Config, servers, syncWrites, localWrites };
}

afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test("existing stored addresses are repaired once and match the addresses exposed to the UI and router", async () => {
    const sync: Record<string, unknown> = { serverPreferences: {
        migratedFrom: "0.16.0", primary: " https://user-primary.example/ ", followOfficial: true,
        excludedIds: [], added: ["https://user.example/", "https://user.example"],
    } };
    const local: Record<string, unknown> = { officialServers: {
        version: 2, nodes: [{ id: "mirror", address: "https://mirror.example/", kind: "mirror" }],
    } };
    const first = await loadConfig(sync, local);
    expect(first.servers.getEffectiveServers()).toEqual({
        primary: "https://user-primary.example", mirrors: ["https://mirror.example", "https://user.example"],
    });
    expect((sync.serverPreferences as ServerPreferences).primary).toBe("https://user-primary.example");
    expect((sync.serverPreferences as ServerPreferences).added).toEqual(["https://user.example"]);
    expect(local.officialServers).toEqual({
        version: 2, nodes: [{ id: "mirror", address: "https://mirror.example", kind: "mirror" }],
    });
    const second = await loadConfig(sync, local);
    second.servers.getEffectiveServers();
    expect(second.syncWrites.some(write => "serverPreferences" in write)).toBe(false);
    expect(second.localWrites.some(write => "officialServers" in write)).toBe(false);
});

test("writing preferences through the configuration proxy saves canonical addresses before reload", async () => {
    const sync: Record<string, unknown> = {};
    const { Config, servers } = await loadConfig(sync);
    Config.config.serverPreferences = {
        ...Config.config.serverPreferences, primary: "https://manual.example/path/", followOfficial: false,
        added: [" https://fallback.example/ ", "https://fallback.example"],
    };
    jest.runOnlyPendingTimers();
    const persisted = sync.serverPreferences as ServerPreferences;
    expect(persisted.primary).toBe("https://manual.example/path");
    expect(persisted.added).toEqual(["https://fallback.example"]);
    expect(servers.getEffectiveServers()).toEqual({ primary: persisted.primary, mirrors: persisted.added });
});
