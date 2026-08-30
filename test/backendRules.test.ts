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

    test("selects in order and applies conflicts in both directions", () => {
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
        expect(selected.map((item) => item.id)).toEqual(["first"]);
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
        const writableMain = backend("main", {
            capabilities: ["GET /api/skipSegments", "POST /api/skipSegments"],
        });
        const readonlyMirror = backend("readonly-mirror", {
            capabilities: ["GET /api/skipSegments"],
            conflicts: ["main"],
        });

        expect(selectMatchedBackends([writableMain, readonlyMirror], context, {}, "querySegments").map((item) => item.id)).toEqual([
            "main",
        ]);
        expect(selectMatchedBackends([writableMain, readonlyMirror], context, {}, "submitSegments").map((item) => item.id)).toEqual([
            "main",
        ]);
        expect(selectMatchedBackends([readonlyMirror, writableMain], context, {}, "querySegments").map((item) => item.id)).toEqual([
            "readonly-mirror",
        ]);
        expect(selectMatchedBackends([readonlyMirror, writableMain], context, {}, "submitSegments").map((item) => item.id)).toEqual([
            "main",
        ]);
    });

    test("does not let disabled or unmatched backends suppress later matches", () => {
        const main = backend("main", { enabled: false, conflicts: ["readonly-mirror"] });
        const readonlyMirror = backend("readonly-mirror", { conflicts: ["main"] });
        const unmatched = backend("unmatched", {
            conflicts: ["readonly-mirror"],
            match: [{ field: "title", exact: ["different"] }],
        });

        expect(selectMatchedBackends([main, readonlyMirror], context).map((item) => item.id)).toEqual(["readonly-mirror"]);
        expect(selectMatchedBackends([unmatched, readonlyMirror], context).map((item) => item.id)).toEqual(["readonly-mirror"]);
    });

    test("applies conflicts without evaluating video match rules when context is absent", () => {
        const main = backend("main", { conflicts: ["mirror"] });
        const mirror = backend("mirror", {
            match: [{ field: "title", exact: ["different"] }],
        });

        expect(selectMatchedBackends([main, mirror], undefined).map((item) => item.id)).toEqual(["main"]);
        expect(selectMatchedBackends([mirror, main], undefined).map((item) => item.id)).toEqual(["mirror"]);
    });
});
