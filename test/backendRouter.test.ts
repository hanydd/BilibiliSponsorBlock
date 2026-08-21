import { getCapabilityForEndpoint } from "../src/requests/backendRouter";

describe("backend capability path normalization", () => {
    test.each([
        ["/api/skipSegments", "/api/skipSegments"],
        ["/api/skipSegments/abcd", "/api/skipSegments"],
        ["/api/portVideo/abcd", "/api/portVideo"],
        ["/api/lockCategories/abcd", "/api/lockCategories"],
        ["/api/videoLabels/abcd", "/api/videoLabels"],
        ["/api/votePort", "/api/votePort"],
        ["/api/userInfo", "/api/userInfo"],
        ["/api/setUsername?userID=private", "/api/setUsername"],
        ["/api/warnUser", "/api/warnUser"],
    ])("maps %s to %s", (endpoint, capability) => {
        expect(getCapabilityForEndpoint(endpoint)).toBe(capability);
    });
});
