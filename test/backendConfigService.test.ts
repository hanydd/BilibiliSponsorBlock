/** @jest-environment jsdom */

describe("backend configuration service normalization", () => {
    beforeEach(() => {
        jest.resetModules();
        jest.doMock("../src/config", () => ({
            __esModule: true,
            default: {
                local: {
                    backendConfig: { backends: [] },
                    backendEnabledMap: {},
                    backendSubscription: {
                        url: "",
                        intervalMinutes: 60,
                        enabled: true,
                        lastSyncAt: null,
                        lastError: null,
                    },
                },
                forceLocalUpdate: jest.fn(),
            },
        }));
        (global as unknown as { chrome: typeof chrome }).chrome = {
            alarms: { clear: jest.fn() },
        } as unknown as typeof chrome;
    });

    test("normalizes conflicts before saving the document", async () => {
        const { BackendConfigService } = await import("../src/config/backendConfigService");
        const config = (await import("../src/config")).default as unknown as {
            local: { backendConfig: { backends: Array<{ id: string; conflicts?: string[] }> } };
        };

        await BackendConfigService.saveConfig({
            backends: [
                {
                    id: "main",
                    name: "Main",
                    api_url: "https://main.example",
                    capabilities: ["GET /api/skipSegments"],
                    conflicts: ["mirror", "mirror"],
                },
                {
                    id: "mirror",
                    name: "Mirror",
                    api_url: "https://mirror.example",
                    capabilities: ["GET /api/skipSegments"],
                },
            ],
        });

        expect(config.local.backendConfig.backends.map(({ id, conflicts }) => ({ id, conflicts }))).toEqual([
            { id: "main", conflicts: ["mirror"] },
            { id: "mirror", conflicts: ["main"] },
        ]);
    });

    test("rejects self-conflicts and invalid JSON instead of normalizing them", async () => {
        const { BackendConfigService } = await import("../src/config/backendConfigService");

        expect(() =>
            BackendConfigService.validateAndNormalize({
                backends: [
                    {
                        id: "main",
                        name: "Main",
                        api_url: "https://main.example",
                        capabilities: ["GET /api/skipSegments"],
                        conflicts: ["main"],
                    },
                ],
            })
        ).toThrow(/cannot reference itself/);
        expect(() => BackendConfigService.validateAndNormalize("not-json")).toThrow();
    });
});
