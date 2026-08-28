import * as CompileConfig from "../config.json";
import {
    addMirrorServerAddress,
    getMigratedMirrorServerAddresses,
    getMirrorServerAddressesAfterPrimaryChange,
    isOfficialServerAddress,
    isRetryableReadRequest,
    removeMirrorServerAddress,
} from "../src/config/serverConfig";

describe("server configuration migration", () => {
    test.each([
        "https://www.bsbsb.top",
        "https://www.bsbsb.top/",
        "https://bsbsb.top",
        "https://www.bsbsb.xyz",
        "http://103.236.70.57:9876",
    ])("recognizes the official address %s", (address) => {
        expect(isOfficialServerAddress(address)).toBe(true);
    });

    test.each(["https://custom.test", "https://www.bsbsb.top:444", "https://www.bsbsb.top/custom"])(
        "does not treat the custom address %s as official",
        (address) => {
            expect(isOfficialServerAddress(address)).toBe(false);
        }
    );

    test("does not add official mirrors to an existing custom primary", () => {
        expect(
            getMigratedMirrorServerAddresses(
                "https://custom.test",
                [...CompileConfig.mirrorServerAddresses],
                false
            )
        ).toEqual([]);
    });

    test("keeps defaults for both official primary spellings", () => {
        for (const address of ["https://www.bsbsb.top", "https://bsbsb.top"]) {
            expect(
                getMigratedMirrorServerAddresses(address, [...CompileConfig.mirrorServerAddresses], false)
            ).toEqual(CompileConfig.mirrorServerAddresses);
        }
    });

    test("preserves an explicitly configured mirror list for a custom primary", () => {
        const configuredMirrors = ["https://mirror.custom.test"];
        expect(getMigratedMirrorServerAddresses("https://custom.test", configuredMirrors, true)).toBe(
            configuredMirrors
        );
    });

    test("removes default official mirrors when the primary changes to a custom server", () => {
        expect(
            getMirrorServerAddressesAfterPrimaryChange(
                "https://bsbsb.top",
                "https://custom.test",
                [...CompileConfig.mirrorServerAddresses]
            )
        ).toEqual([]);
    });

    test("keeps a user-configured mirror list when the primary changes", () => {
        const configuredMirrors = ["https://mirror.custom.test"];
        expect(
            getMirrorServerAddressesAfterPrimaryChange(
                "https://www.bsbsb.top",
                "https://custom.test",
                configuredMirrors
            )
        ).toBe(configuredMirrors);
    });

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
