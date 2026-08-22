import { sendRealRequestToCustomServer } from "../src/requests/backendTransport";
import { getCapabilityForEndpoint, requestFromBackend } from "../src/requests/backendRouter";
import { BackendConfig, getBackendOperation } from "../src/backends";

jest.mock("../src/requests/backendTransport", () => ({
    sendRealRequestToCustomServer: jest.fn(),
}));

describe("backend capability routing", () => {
    test.each([
        ["GET", "/api/skipSegments", "GET /api/skipSegments"],
        ["GET", "/api/skipSegments/abcd", "GET /api/skipSegments/:sha256HashPrefix"],
        ["POST", "/api/skipSegments", "POST /api/skipSegments"],
        ["GET", "/api/portVideo/abcd", "GET /api/portVideo/:sha256HashPrefix"],
        ["GET", "/api/lockCategories/abcd", "GET /api/lockCategories/:sha256HashPrefix"],
        ["GET", "/api/videoLabels/abcd", "GET /api/videoLabels/:sha256HashPrefix"],
        ["POST", "/api/portVideo", "POST /api/portVideo"],
        ["POST", "/api/votePort", "POST /api/votePort"],
        ["GET", "/api/userInfo?publicUserID=private", "GET /api/userInfo"],
        ["POST", "/api/setUsername?userID=private", "POST /api/setUsername"],
        ["POST", "/api/warnUser", "POST /api/warnUser"],
    ])("maps %s %s to %s", (method, endpoint, capability) => {
        expect(getCapabilityForEndpoint(endpoint, method)).toBe(capability);
    });

    test("does not map unsupported methods or unknown paths", () => {
        expect(getCapabilityForEndpoint("/api/votePort", "GET")).toBeNull();
        expect(getCapabilityForEndpoint("/api/segmentInfo", "GET")).toBeNull();
        expect(getBackendOperation("GET", "/api/segmentInfo")).toBeNull();
    });

    test("uses mirrors only for read requests", async () => {
        const request = sendRealRequestToCustomServer as jest.Mock;
        request.mockResolvedValueOnce({ responseText: "", status: 503, ok: false });
        request.mockResolvedValueOnce({ responseText: "[]", status: 200, ok: true });

        const backend: BackendConfig = {
            id: "primary",
            name: "Primary",
            api_url: "https://primary.example",
            capabilities: ["GET /api/skipSegments", "POST /api/skipSegments"],
            mirrors: ["https://mirror.example"],
        };

        await requestFromBackend(backend, "GET", "/api/skipSegments");
        expect(request).toHaveBeenNthCalledWith(
            1,
            "GET",
            "https://primary.example/api/skipSegments",
            {},
            {}
        );
        expect(request).toHaveBeenNthCalledWith(
            2,
            "GET",
            "https://mirror.example/api/skipSegments",
            {},
            {}
        );

        request.mockClear();
        request.mockResolvedValue({ responseText: "", status: 200, ok: true });
        await requestFromBackend(backend, "POST", "/api/skipSegments");
        expect(request).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenCalledWith("POST", "https://primary.example/api/skipSegments", {}, {});
    });
});
