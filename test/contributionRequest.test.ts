import { asyncRequestToServer } from "../src/requests/requests";

test("missing background response rejects instead of leaving the page loading forever", async () => {
    (globalThis as any).chrome = {
        runtime: {
            lastError: { message: "Extension context invalidated" },
            sendMessage: (_request: unknown, callback: (response: unknown) => void) => callback(undefined),
        },
    };
    try {
        await expect(asyncRequestToServer("GET", "/api/contributionStats")).rejects.toThrow(
            "Extension context invalidated",
        );
    } finally {
        delete (globalThis as any).chrome;
    }
});
