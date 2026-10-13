import {
    addMirrorServerAddress,
    isRetryableReadRequest,
    removeMirrorServerAddress,
} from "../src/config/serverConfig";

describe("server address utilities", () => {
    test("does not add a duplicate mirror with different trailing slashes", () => {
        const configuredMirrors = ["https://mirror.custom.test/"];
        expect(addMirrorServerAddress(configuredMirrors, "https://mirror.custom.test")).toBe(
            configuredMirrors
        );
    });

    test("removes mirrors by their normalized address", () => {
        expect(
            removeMirrorServerAddress(
                ["https://mirror.custom.test/", "https://other-mirror.test"],
                "https://mirror.custom.test"
            )
        ).toEqual(["https://other-mirror.test"]);
    });

    test.each([
        "/api/skipSegments/abcd",
        "/api/videoLabels/abcd",
        "/api/userInfo",
        "/api/getUsername?userID=test",
        "/api/chapterNames",
        "/api/lockCategories/abcd",
        "/api/portVideo/abcd",
    ])("allows retrying the safe read endpoint %s", (endpoint) => {
        expect(isRetryableReadRequest("GET", endpoint)).toBe(true);
    });

    test.each([
        ["GET", "/api/viewedVideoSponsorTime?UUID=test"],
        ["GET", "/api/voteOnSponsorTime?UUID=test"],
        ["POST", "/api/userInfo"],
        ["POST", "/api/skipSegments/abcd"],
    ])("does not retry the side-effect request %s %s", (type, endpoint) => {
        expect(isRetryableReadRequest(type, endpoint)).toBe(false);
    });
});
