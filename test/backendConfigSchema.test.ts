import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

import * as BackendSchema from "../backends.schema.json";
import * as DefaultBackends from "../backends.json";
import * as TestBackends from "../backends.test.json";
import {
    BACKEND_REQUEST_CAPABILITIES,
    validateBackendConfigDocument,
} from "../src/backends";

const schema = BackendSchema as unknown as {
    $defs: {
        capability: {
            enum: string[];
        };
    };
};

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function expectSchemaValid(value: unknown): void {
    if (!validateSchema(value)) {
        throw new Error(ajv.errorsText(validateSchema.errors));
    }
}

function expectSchemaInvalid(value: unknown): void {
    expect(validateSchema(value)).toBe(false);
}

function backend(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: "primary",
        name: "Primary",
        api_url: "https://primary.example",
        capabilities: ["GET /api/skipSegments"],
        ...overrides,
    };
}

describe("backends.json JSON Schema", () => {
    test("compiles as Draft 2020-12 and matches the registered capabilities", () => {
        expect(validateSchema).toEqual(expect.any(Function));
        expect(schema.$defs.capability.enum).toEqual([...BACKEND_REQUEST_CAPABILITIES]);
    });

    test.each([
        ["the default configuration", DefaultBackends],
        ["the test configuration", TestBackends],
    ])("accepts %s", (_, configuration) => {
        expectSchemaValid(configuration);
    });

    test("accepts all match expression forms and empty logical operands", () => {
        expectSchemaValid({
            backends: [
                backend({
                    match: [
                        { field: "title", exact: ["Example"] },
                        { field: "description", regexp: "^Example" },
                        { and: [] },
                        { or: [] },
                        { not: { field: "up_name", exact: [] } },
                    ],
                    mirrors: ["https://mirror.example"],
                    conflicts: ["readonly"],
                }),
                backend({
                    id: "readonly",
                    name: "Read-only",
                    api_url: "http://readonly.example",
                    conflicts: ["primary"],
                }),
            ],
        });
    });

    test.each([
        ["missing required fields", { backends: [{ id: "primary" }] }],
        ["unknown root fields", { backends: [], extra: true }],
        ["unknown backend fields", { backends: [backend({ extra: true })] }],
        ["invalid IDs", { backends: [backend({ id: "Primary-1" })] }],
        ["invalid URLs", { backends: [backend({ api_url: "ftp://primary.example" })] }],
        ["unknown capabilities", { backends: [backend({ capabilities: ["GET /api/unknown"] })] }],
        ["duplicate capabilities", { backends: [backend({ capabilities: ["GET /api/skipSegments", "GET /api/skipSegments"] })] }],
        ["duplicate mirrors", { backends: [backend({ mirrors: ["https://mirror.example", "https://mirror.example"] })] }],
        ["duplicate conflicts", { backends: [backend({ conflicts: ["readonly", "readonly"] })] }],
        ["mixed leaf operators", { backends: [backend({ match: [{ field: "title", exact: [], regexp: "example" }] })] }],
        ["invalid logical operands", { backends: [backend({ match: [{ and: {} }] })] }],
    ])("rejects %s", (_, configuration) => {
        expectSchemaInvalid(configuration);
    });

    test("leaves cross-backend and JavaScript regexp semantics to the runtime validator", () => {
        const invalidSemantics = {
            backends: [
                backend({
                    conflicts: ["missing"],
                    match: [{ field: "title", regexp: "[" }],
                }),
                backend({ id: "primary", name: "Duplicate" }),
            ],
        };

        expectSchemaValid(invalidSemantics);
        expect(validateBackendConfigDocument(invalidSemantics).valid).toBe(false);
    });
});
