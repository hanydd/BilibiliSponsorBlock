import { getCapabilityForEndpoint } from "../src/requests/backendRouter";
import { getBackendOperation } from "../src/backends";

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
});
