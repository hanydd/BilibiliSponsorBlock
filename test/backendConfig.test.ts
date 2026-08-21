import {
    BackendConfig,
    BackendConfigDocument,
    BackendRequestCapability,
    getDefaultBackendConfig,
    normalizeBackendEnabledMap,
    validateBackendConfigDocument,
} from "../src/backends";

const skipCapability: BackendRequestCapability = "/api/skipSegments";

function backend(overrides: Partial<BackendConfig> = {}): BackendConfig {
    return {
        id: "primary",
        name: "Primary",
        api_url: "https://primary.example",
        capabilities: [skipCapability],
        ...overrides,
    };
}

describe("backend configuration contract", () => {
    test("accepts the default root configuration and deep clones it", () => {
        const document = getDefaultBackendConfig();
        expect(document.backends[0].api_url).toBe("https://www.bsbsb.top");
        expect(document.backends[0].capabilities).toContain(skipCapability);

        document.backends[0].name = "changed";
        expect(getDefaultBackendConfig().backends[0].name).not.toBe("changed");
    });

    test("rejects invalid IDs, URLs, capabilities, regexps, conflicts, and duplicate mirrors", () => {
        const document = {
            backends: [
                backend({
                    id: "Primary-1",
                    api_url: "ftp://primary.example",
                    capabilities: ["/api/nope" as BackendRequestCapability],
                    mirrors: ["https://mirror.example", "https://mirror.example"],
                    conflicts: ["missing"],
                    match: [{ field: "title", regexp: "[" }],
                }),
            ],
        };
        const result = validateBackendConfigDocument(document);
        expect(result.valid).toBe(false);
        expect(result.errors.join(" ")).toMatch(/id/);
        expect(result.errors.join(" ")).toMatch(/URL/);
        expect(result.errors.join(" ")).toMatch(/capabilit/);
        expect(result.errors.join(" ")).toMatch(/regular expression/);
        expect(result.errors.join(" ")).toMatch(/unknown backend ID/);
        expect(result.errors.join(" ")).toMatch(/duplicates/);
    });

    test("does not allow enabled map fields inside JSON", () => {
        const document = { backends: [backend()], backendEnabledMap: { primary: false } };
        expect(validateBackendConfigDocument(document).valid).toBe(false);
    });

    test("normalizes the independent enabled map without changing the document", () => {
        const document: BackendConfigDocument = {
            backends: [backend(), backend({ id: "secondary", name: "Secondary", api_url: "https://secondary.example" })],
        };
        const enabledMap = normalizeBackendEnabledMap(document, { primary: false, removed: false });
        expect(enabledMap).toEqual({ primary: false, secondary: true });
        expect(document.backends).toHaveLength(2);
    });
});
