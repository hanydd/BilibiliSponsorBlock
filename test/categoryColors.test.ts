/** @jest-environment node */
import { decodeBarColors, encodeBarColors, decodeDynamicSponsorColors, encodeDynamicSponsorColors, RuntimeColors } from "../src/config/categoryColors";

jest.mock("../src/utils/", () => ({ isFirefox: () => false }));

const defaults: RuntimeColors = {
    sponsor: { color: "#00d400", opacity: "0.7" },
    "preview-sponsor": { color: "#007800", opacity: "0.7" },
    "preview-chooseACategory": { color: "#ffffff", opacity: "0.7" },
    exclusive_access: { color: "#008a5c", opacity: "0.7" },
    filler: { color: "#7300FF", opacity: "0.9" },
    "preview-filler": { color: "#2E0066", opacity: "0.7" },
};

test("both formats expose the same business interface and use default opacity", () => {
    const legacy = { sponsor: { color: "#123456", opacity: "0.2" }, "preview-sponsor": { color: "#654321", opacity: "0.3" } };
    const compact = { sponsor: ["#123456", "#654321"] };
    const colors = decodeBarColors(legacy, defaults);
    expect(decodeBarColors(compact, defaults)).toEqual(colors);
    expect(colors.sponsor).toEqual({ color: "#123456", opacity: "0.7" });
    expect(colors["preview-sponsor"]).toEqual({ color: "#654321", opacity: "0.7" });
    expect(colors.filler.opacity).toBe("0.9");
    expect(legacy.sponsor.opacity).toBe("0.2");
});

test("storage retains paired colors and missing sides, but no opacity", () => {
    const colors = encodeBarColors(decodeBarColors({ "preview-future": { color: "#112233" } }, defaults));
    expect(colors.sponsor).toEqual(["#00d400", "#007800"]);
    expect(colors.chooseACategory).toEqual([null, "#ffffff"]);
    expect(colors.exclusive_access).toEqual(["#008a5c", null]);
    expect(colors.future).toEqual([null, "#112233"]);
    expect(JSON.stringify(colors)).not.toContain("opacity");
    expect(Object.keys(colors).some(key => key.startsWith("preview-"))).toBe(false);
});

test("a partial tuple fills defaults and editing the runtime palette does not change them", () => {
    const colors = decodeBarColors({ sponsor: ["#123456"] }, defaults);
    expect(colors["preview-sponsor"].color).toBe("#007800");
    colors["preview-sponsor"].color = "#654321";
    expect(encodeBarColors(colors).sponsor).toEqual(["#123456", "#654321"]);
    expect(defaults["preview-sponsor"].color).toBe("#007800");
});

test("dynamic labels keep their business interface while opacity is omitted from storage", () => {
    const colors = decodeDynamicSponsorColors({ sponsor: { color: "#123456", opacity: "0.2" } }, defaults);
    expect(colors.sponsor).toEqual({ color: "#123456", opacity: "0.7" });
    expect(encodeDynamicSponsorColors(colors).sponsor).toEqual({ color: "#123456" });
});

async function loadConfig(stored: Record<string, unknown>) {
    jest.resetModules();
    jest.useFakeTimers();
    let listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
    const writes: Record<string, unknown>[] = [];
    const clone = (value: unknown) => JSON.parse(JSON.stringify(value));
    global.chrome = {
        runtime: {},
        storage: {
            onChanged: { addListener: fn => { listener = fn; } },
            sync: {
                get: (_keys, done) => done(clone(stored)),
                set: (items, done = () => undefined) => {
                    const values = clone(items);
                    writes.push(values);
                    Object.assign(stored, values);
                    listener(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }])), "sync");
                    done();
                },
                remove: key => { delete stored[String(key)]; },
            },
            local: { get: (_keys, done) => done({}), set: (_items, done = () => undefined) => done() },
        },
    } as unknown as typeof chrome;
    const Config = (await import("../src/config")).default;
    await Config.ready;
    jest.runOnlyPendingTimers();
    return { Config, writes, external: (values: Record<string, unknown>) => {
        listener(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }])), "sync");
    } };
}

afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test("startup migrates storage once and reload keeps the original runtime interface", async () => {
    const stored = {
        barTypes: { sponsor: { color: "#123456", opacity: "0.2" }, "preview-sponsor": { color: "#654321", opacity: "0.3" } },
        dynamicSponsorTypes: { dynamicSponsor_sponsor: { color: "#abcdef", opacity: "0.4" } },
    } as Record<string, unknown>;
    const first = await loadConfig(stored);
    expect(first.Config.config.barTypes.sponsor.color).toBe("#123456");
    expect(first.Config.config.barTypes["preview-sponsor"].color).toBe("#654321");
    expect((stored.barTypes as Record<string, unknown>).sponsor).toEqual(["#123456", "#654321"]);
    expect(JSON.stringify(stored.barTypes)).not.toContain("opacity");
    expect(JSON.stringify(stored.dynamicSponsorTypes)).not.toContain("opacity");
    const second = await loadConfig(stored);
    expect(second.Config.config.barTypes.sponsor.color).toBe("#123456");
    expect(second.writes.some(write => "barTypes" in write || "dynamicSponsorTypes" in write)).toBe(false);
});

test("old-style nested edits and forced saves always persist compact colors", async () => {
    const stored: Record<string, unknown> = {};
    const { Config } = await loadConfig(stored);
    Config.config.barTypes.sponsor.color = "#123456";
    Config.config.barTypes["preview-sponsor"].color = "#654321";
    Config.forceSyncUpdate("barTypes");
    jest.runOnlyPendingTimers();
    expect((stored.barTypes as Record<string, unknown>).sponsor).toEqual(["#123456", "#654321"]);
    expect(Config.config.barTypes.sponsor.color).toBe("#123456");
    expect(Config.syncDefaults.barTypes.sponsor.color).toBe("#00d400");
});

test("imports and sync events decode compact and legacy formats before notifying business listeners", async () => {
    const stored: Record<string, unknown> = {};
    const { Config, external } = await loadConfig(stored);
    const legacy = { sponsor: { color: "#123456", opacity: "0.2" }, "preview-sponsor": { color: "#654321", opacity: "0.3" } };
    Config.config.barTypes = legacy as unknown as typeof Config.config.barTypes;
    jest.runOnlyPendingTimers();
    expect((stored.barTypes as Record<string, unknown>).sponsor).toEqual(["#123456", "#654321"]);
    const observed = jest.fn();
    Config.configSyncListeners.push(observed);
    external({ barTypes: { sponsor: ["#abcdef", "#fedcba"] } });
    expect(Config.config.barTypes.sponsor.color).toBe("#abcdef");
    expect(observed.mock.calls[0][0].barTypes.newValue.sponsor).toEqual({ color: "#abcdef", opacity: "0.7" });
    external({ barTypes: { sponsor: { color: "#112233", opacity: "0.5" } } });
    expect(Config.config.barTypes.sponsor).toEqual({ color: "#112233", opacity: "0.7" });
});

test("reset saves the compact defaults and restores the runtime colors", async () => {
    const stored: Record<string, unknown> = {};
    const { Config } = await loadConfig(stored);
    Config.config.barTypes.sponsor.color = "#123456";
    Config.resetToDefault();
    expect((stored.barTypes as Record<string, unknown>).sponsor).toEqual(["#00d400", "#007800"]);
    expect(Config.config.barTypes.sponsor).toEqual({ color: "#00d400", opacity: "0.7" });
});
