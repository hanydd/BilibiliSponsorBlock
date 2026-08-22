import {
    createOptionsBackup,
    createOtherDataBackup,
    parseOptionsBackup,
    parseOtherDataBackup,
} from "../src/config/backup";

const backendConfig = {
    backends: [
        {
            id: "primary",
            name: "Primary",
            api_url: "https://primary.example",
            capabilities: ["GET /api/skipSegments"],
        },
    ],
};

const localStorage = {
    backendConfig,
    backendEnabledMap: { primary: false },
    backendSubscription: {
        url: "https://example.com/backends.json",
        intervalMinutes: 30,
        enabled: true,
        lastSyncAt: 123,
        lastError: "temporary error",
    },
    lastSubmissionBackendId: "primary",
    navigationApiAvailable: true,
    unsubmittedSegments: { BV1test: [] },
};

describe("backup partitioning", () => {
    test("puts backend settings in the options backup and keeps runtime out", () => {
        const backup = createOptionsBackup({ userID: "user", skipCount: 2 }, localStorage);

        expect(backup).toEqual({
            userID: "user",
            skipCount: 2,
            backendSettings: {
                backendConfig,
                backendEnabledMap: { primary: false },
                backendSubscription: {
                    url: "https://example.com/backends.json",
                    intervalMinutes: 30,
                    enabled: true,
                },
            },
        });
        expect(JSON.stringify(backup)).not.toContain("lastSyncAt");
        expect(JSON.stringify(backup)).not.toContain("lastSubmissionBackendId");
    });

    test("keeps other local data and puts backend runtime in the other-data backup", () => {
        const backup = createOtherDataBackup(localStorage);

        expect(backup.navigationApiAvailable).toBe(true);
        expect(backup.unsubmittedSegments).toEqual({ BV1test: [] });
        expect(backup.backendConfig).toBeUndefined();
        expect(backup.backendEnabledMap).toBeUndefined();
        expect(backup.backendSubscription).toBeUndefined();
        expect(backup.backendRuntime).toEqual({
            lastSyncAt: 123,
            lastError: "temporary error",
            lastSubmissionBackendId: "primary",
        });
    });

    test("parses new backups and preserves the two storage boundaries", () => {
        const options = parseOptionsBackup(
            createOptionsBackup({ userID: "user" }, localStorage)
        );
        expect(options.sync).toEqual({ userID: "user" });
        expect(options.backendSettings?.backendEnabledMap).toEqual({ primary: false });

        const other = parseOtherDataBackup(createOtherDataBackup(localStorage));
        expect(other.local).toEqual({
            navigationApiAvailable: true,
            unsubmittedSegments: { BV1test: [] },
        });
        expect(other.backendRuntime?.lastSubmissionBackendId).toBe("primary");
    });

    test("accepts legacy flat backups without inventing a new partition", () => {
        expect(parseOptionsBackup('{"userID":"legacy"}')).toEqual({
            sync: { userID: "legacy" },
        });
        expect(parseOtherDataBackup('{"navigationApiAvailable":false,"backendConfig":{}}')).toEqual({
            local: { navigationApiAvailable: false, backendConfig: {} },
        });
    });

    test("rejects invalid backend settings and runtime before any values are returned", () => {
        expect(() =>
            parseOptionsBackup(
                JSON.stringify({
                    backendSettings: {
                        backendConfig: { backends: [] },
                        backendEnabledMap: { primary: "yes" },
                        backendSubscription: { url: "", intervalMinutes: 30, enabled: true },
                    },
                })
            )
        ).toThrow();
        expect(() =>
            parseOtherDataBackup(
                JSON.stringify({
                    backendRuntime: {
                        lastSyncAt: "yesterday",
                        lastError: null,
                        lastSubmissionBackendId: null,
                    },
                })
            )
        ).toThrow();
    });
});
