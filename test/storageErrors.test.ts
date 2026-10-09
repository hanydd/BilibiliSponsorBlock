import { ProtoConfig } from "../src/config/config";
import { PersistentTTLCache } from "../src/requests/apiCache";

jest.mock("../src/utils/", () => ({ isFirefox: () => false }));
jest.mock("../src/config", () => ({ __esModule: true, default: { config: { enableCache: true } } }));

type LocalData = {
    navigationApiAvailable: boolean;
    unsubmittedSegments: Record<string, unknown[]>;
    videoPageCidMap: Record<string, unknown>;
    downvotedSegments: Record<string, unknown>;
    customSkipSound: { dataUrl: string; name: string } | null;
    alreadyInstalled: boolean;
};

let stored: Record<string, unknown>;
let errors: Partial<Record<"get" | "set" | "remove", string>>;
let log: jest.SpyInstance;
let notify: jest.Mock;

function complete(operation: keyof typeof errors, callback: () => void): void {
    if (errors[operation]) Object.assign(chrome.runtime, { lastError: { message: errors[operation] } });
    try {
        callback();
    } finally {
        Reflect.deleteProperty(chrome.runtime, "lastError");
    }
}

beforeEach(() => {
    jest.useFakeTimers();
    stored = {};
    errors = {};
    log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(console, "debug").mockImplementation(() => undefined);
    notify = jest.fn();
    global.alert = notify;
    global.chrome = {
        runtime: {},
        i18n: { getMessage: key => key === "storageWriteFailed" ? "Could not save local extension data." : key },
        storage: {
            onChanged: { addListener: jest.fn() },
            sync: { get: (_keys, callback) => callback({}) },
            local: {
                get: jest.fn((key, callback) => complete("get", () => callback(
                    errors.get ? undefined : JSON.parse(JSON.stringify(key === null ? stored : { [key]: stored[key] }))
                ))),
                set: jest.fn((items, callback) => {
                    if (!errors.set) Object.assign(stored, JSON.parse(JSON.stringify(items)));
                    complete("set", () => callback?.());
                }),
                remove: jest.fn((key, callback) => {
                    if (!errors.remove) delete stored[key];
                    complete("remove", () => callback?.());
                }),
            },
        },
    } as unknown as typeof chrome;
});

afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    Reflect.deleteProperty(global, "alert");
    Reflect.deleteProperty(global, "chrome");
});

async function createConfig() {
    const config = new ProtoConfig<{ invidiousInstances: string[] }, LocalData>(
        { invidiousInstances: [] },
        {
            navigationApiAvailable: false,
            unsubmittedSegments: {},
            videoPageCidMap: {},
            downvotedSegments: {},
            customSkipSound: null,
            alreadyInstalled: false,
        },
        () => undefined
    );
    await config.ready;
    return config;
}

test.each(["An unexpected error occurred", "QUOTA_BYTES quota exceeded"])(
    "draft saving exposes the original error without assuming storage is full: %s",
    async message => {
        const config = await createConfig();
        errors.set = message;
        config.local.unsubmittedSegments.privateVideo = [{ privateDraft: true }];
        config.forceLocalUpdate("unsubmittedSegments");

        expect(notify).toHaveBeenCalledWith(`Could not save local extension data.\n\n${message}`);
        expect(log).toHaveBeenCalledWith("[BilibiliSponsorBlock] storage.local.set failed", {
            key: "unsubmittedSegments", message,
        });
        expect(JSON.stringify(log.mock.calls)).not.toContain("privateDraft");
    }
);

test.each(["navigationApiAvailable", "downvotedSegments"])(
    "best-effort %s updates log failures without interrupting browsing", async key => {
        const config = await createConfig();
        errors.set = "An unexpected error occurred";
        config.forceLocalUpdate(key);
        expect(log).toHaveBeenCalledWith("[BilibiliSponsorBlock] storage.local.set failed", {
            key, message: errors.set,
        });
        expect(notify).not.toHaveBeenCalled();
    }
);

test("ordinary local bookkeeping writes also log failures", async () => {
    const config = await createConfig();
    errors.set = "An unexpected error occurred";
    config.local.alreadyInstalled = true;
    expect(log).toHaveBeenCalledWith("[BilibiliSponsorBlock] storage.local.set failed", {
        key: "alreadyInstalled", message: errors.set,
    });
    expect(notify).not.toHaveBeenCalled();
});

test("a failed custom sound save notifies the user with the original error", async () => {
    const config = await createConfig();
    errors.set = "QUOTA_BYTES quota exceeded";
    config.local.customSkipSound = { dataUrl: "private-audio", name: "sound.wav" };
    expect(notify).toHaveBeenCalledWith(`Could not save local extension data.\n\n${errors.set}`);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-audio");
});

test("deleting local data logs a failure without an alert", async () => {
    const config = await createConfig();
    errors.remove = "An unexpected error occurred";
    delete config.local.alreadyInstalled;
    expect(log).toHaveBeenCalledWith("[BilibiliSponsorBlock] storage.local.remove failed", {
        key: "alreadyInstalled", message: errors.remove,
    });
    expect(notify).not.toHaveBeenCalled();
});

test("reading local configuration logs its original error without a page-load alert", async () => {
    errors.get = "An unexpected error occurred";
    const config = await createConfig();
    expect(config.local.unsubmittedSegments).toEqual({});
    expect(log).toHaveBeenCalledWith("[BilibiliSponsorBlock] storage.local.get failed", {
        key: "*", message: errors.get,
    });
    expect(notify).not.toHaveBeenCalled();
});

test("successful local writes do not log errors or alert", async () => {
    const config = await createConfig();
    config.local.unsubmittedSegments.video = [1];
    config.forceLocalUpdate("unsubmittedSegments");
    expect(stored.unsubmittedSegments).toEqual({ video: [1] });
    expect(log).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
});

test("cache read failures log and allow using an empty in-memory cache", async () => {
    errors.get = "An unexpected error occurred";
    const cache = new PersistentTTLCache<string, string>("test", 10000);
    expect(await cache.get("video")).toBeUndefined();
    await cache.set("video", "new response");
    expect(await cache.get("video")).toBe("new response");
    expect(log).toHaveBeenCalledWith("[BilibiliSponsorBlock] storage.local.get failed", {
        key: "bsb_cache_test", message: errors.get,
    });
    expect(notify).not.toHaveBeenCalled();
});

test("cache persistence failure only logs and preserves the usable in-memory response", async () => {
    const cache = new PersistentTTLCache<string, string>("test", 10000);
    errors.set = "QUOTA_BYTES quota exceeded";
    await cache.set("video", "private response");
    jest.advanceTimersByTime(5000);
    expect(stored.bsb_cache_test).toBeUndefined();
    expect(await cache.get("video")).toBe("private response");
    expect(log).toHaveBeenCalledWith("[BilibiliSponsorBlock] storage.local.set failed", {
        key: "bsb_cache_test", message: errors.set,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private response");
    expect(notify).not.toHaveBeenCalled();
});

test("cache removal failure rejects, preserves data and stats, and permits a later retry", async () => {
    const cache = new PersistentTTLCache<string, string>("test", 10000);
    await cache.set("video", "response");
    jest.advanceTimersByTime(5000);
    const before = cache.getCacheStats();
    errors.remove = "An unexpected error occurred";
    await expect(cache.clear()).rejects.toThrow(errors.remove);
    expect(stored.bsb_cache_test).toBeDefined();
    expect(await cache.get("video")).toBe("response");
    expect(cache.getCacheStats()).toMatchObject({ entryCount: before.entryCount, sizeBytes: before.sizeBytes });
    expect(log).toHaveBeenCalledWith("[BilibiliSponsorBlock] storage.local.remove failed", {
        key: "bsb_cache_test", message: errors.remove,
    });
    expect(notify).not.toHaveBeenCalled();

    delete errors.remove;
    await expect(cache.clear()).resolves.toBeUndefined();
    expect(stored.bsb_cache_test).toBeUndefined();
    expect(await cache.get("video")).toBeUndefined();
});

test("clearing a cache cancels its pending save so it is not recreated later", async () => {
    const cache = new PersistentTTLCache<string, string>("test", 10000);
    await cache.set("video", "response");
    await cache.clear();
    jest.runOnlyPendingTimers();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(stored.bsb_cache_test).toBeUndefined();
    expect(await cache.get("video")).toBeUndefined();
});

test("clearing all caches propagates storage failure instead of reporting success", async () => {
    let clearAllCacheBackground: () => Promise<void>;
    jest.isolateModules(() => {
        ({ clearAllCacheBackground } = require("../src/requests/background/backgroundCache"));
    });
    errors.remove = "An unexpected error occurred";
    await expect(clearAllCacheBackground()).rejects.toThrow(errors.remove);
    expect(notify).not.toHaveBeenCalled();
});

test("legacy cache cleanup logs failures without interrupting startup", () => {
    errors.remove = "An unexpected error occurred";
    jest.isolateModules(() => require("../src/requests/background/backgroundCache"));
    expect(log).toHaveBeenCalledWith("[BilibiliSponsorBlock] storage.local.remove failed", {
        key: "bsb_cache_segments", message: errors.remove,
    });
    expect(notify).not.toHaveBeenCalled();
});
