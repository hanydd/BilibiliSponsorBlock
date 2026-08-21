/** @jest-environment jsdom */

describe("content backend service adapter", () => {
    beforeEach(() => {
        jest.resetModules();
        (global as unknown as { chrome: typeof chrome }).chrome = {
            runtime: {
                sendMessage: jest.fn(),
            },
        } as unknown as typeof chrome;
    });

    test("filters submission candidates to enabled skipSegments backends", async () => {
        const sendMessage = (global.chrome.runtime.sendMessage as jest.Mock).mockImplementation((request, callback) => {
            if (request.method === "getSubmissionBackends") {
                callback({
                    backends: [
                        { id: "primary", name: "Primary", capabilities: ["/api/skipSegments"] },
                        { id: "disabled", name: "Disabled", capabilities: ["/api/skipSegments"], enabled: false },
                        { id: "vote-only", name: "Vote only", capabilities: ["/api/voteOnSponsorTime"] },
                    ],
                });
            }
        });

        const { getSubmissionBackends } = await import("../src/content/backendService");
        const backends = await getSubmissionBackends({
            bvid: "BV1test",
            title: "title",
            description: "description",
            up_mid: "1",
            up_name: "up",
        });

        expect(backends.map((backend) => backend.id)).toEqual(["primary"]);
        expect(sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({ message: "getSubmissionBackends", method: "getSubmissionBackends" }),
            expect.any(Function)
        );
    });

    test("reads and persists the last selected backend id", async () => {
        (global.chrome.runtime.sendMessage as jest.Mock).mockImplementation((request, callback) => {
            if (request.method === "getLastSubmissionBackendId") callback({ backendId: "secondary" });
            else if (request.method === "setLastSubmissionBackendId") callback({ ok: true });
        });

        const { getLastSubmissionBackendId, setLastSubmissionBackendId } = await import("../src/content/backendService");

        expect(await getLastSubmissionBackendId()).toBe("secondary");
        await setLastSubmissionBackendId("primary");
        expect(global.chrome.runtime.sendMessage).toHaveBeenLastCalledWith(
            expect.objectContaining({ message: "setLastSubmissionBackendId", backendId: "primary" }),
            expect.any(Function)
        );
    });
});
