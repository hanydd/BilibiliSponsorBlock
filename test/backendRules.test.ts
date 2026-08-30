import {
    BackendConfig,
    BackendMatchExpression,
    VideoMatchContext,
    matchesBackend,
    selectMatchedBackends,
} from "../src/backends";

const context: VideoMatchContext = {
    bvid: "BV1example",
    title: "Example tutorial",
    description: "A useful description",
    up_mid: "123456789012345678",
    up_name: "Example Author",
};

function backend(id: string, overrides: Partial<BackendConfig> = {}): BackendConfig {
    return {
        id,
        name: id,
        api_url: `https://${id}.example`,
        capabilities: ["GET /api/skipSegments"],
        ...overrides,
    };
}

describe("backend matching", () => {
    test("supports exact, regexp, and nested and/or/not expressions", () => {
        const expression: BackendMatchExpression = {
            or: [
                { field: "title", exact: ["not this"] },
                {
                    and: [
                        { field: "description", regexp: "useful" },
                        { not: { field: "up_mid", exact: ["999"] } },
                        { field: "up_name", exact: ["Example Author"] },
                    ],
                },
            ],
        };
        expect(matchesBackend(backend("matched", { match: [expression] }), context)).toBe(true);
        expect(matchesBackend(backend("all"), context)).toBe(true);
        expect(matchesBackend(backend("none", { match: [{ field: "title", exact: ["other"] }] }), context)).toBe(false);
    });

    test("uses string semantics for bigint-like UP mids and top-level implicit AND", () => {
        expect(
            matchesBackend(
                backend("matched", {
                    match: [
                        { field: "up_mid", exact: ["123456789012345678"] },
                        { field: "title", regexp: "^Example" },
                    ],
                }),
                context
            )
        ).toBe(true);
        expect(matchesBackend(backend("mismatch", { match: [{ field: "up_mid", exact: ["123"] }] }), context)).toBe(false);
    });

    test("selects in order, applies enabled map, and only conflicts with later backends", () => {
        const selected = selectMatchedBackends(
            [
                backend("first", { conflicts: ["third"] }),
                backend("second", { conflicts: ["first"] }),
                backend("third"),
                backend("disabled"),
            ],
            context,
            { disabled: false }
        );
        expect(selected.map((item) => item.id)).toEqual(["first", "second"]);
    });

    test("uses JSON defaults until an explicit map override exists", () => {
        const selected = selectMatchedBackends(
            [backend("default-off", { enabled: false }), backend("default-on", { enabled: true })],
            context
        );
        expect(selected.map((item) => item.id)).toEqual(["default-on"]);
        expect(
            selectMatchedBackends(
                [backend("default-off", { enabled: false }), backend("default-on", { enabled: true })],
                context,
                { "default-off": true, "default-on": false }
            ).map((item) => item.id)
        ).toEqual(["default-off"]);
    });

    test("applies conflicts among backends that support the current operation", () => {
        const readonlyMirror = backend("readonly-mirror", {
            capabilities: ["GET /api/skipSegments"],
            conflicts: ["main"],
        });
        const writableMain = backend("main", {
            capabilities: ["GET /api/skipSegments", "POST /api/skipSegments"],
        });

        expect(selectMatchedBackends([readonlyMirror, writableMain], context, {}, "querySegments").map((item) => item.id)).toEqual([
            "readonly-mirror",
        ]);
        expect(selectMatchedBackends([readonlyMirror, writableMain], context, {}, "submitSegments").map((item) => item.id)).toEqual([
            "main",
        ]);
    });
});
