import { aggregateUserWorkStats } from "../src/requests/background/userStatsRequest";
import { BackendRequestCapability } from "../src/backends";

function result(backendId: string, capabilities: string[], responseText: string, ok = true) {
    return {
        backend: {
            id: backendId,
            name: backendId,
            api_url: `https://${backendId}.example`,
            capabilities: capabilities as BackendRequestCapability[],
        },
        backendId,
        priority: 0,
        response: { responseText, status: ok ? 200 : 503, ok },
    };
}

describe("multi-backend UserWork statistics", () => {
    test("aggregates query stats and only counts submissions from upload-capable backends", () => {
        const response = aggregateUserWorkStats([
            result(
                "query-only",
                ["GET /api/userInfo"],
                JSON.stringify({ userName: "first", viewCount: 10, minutesSaved: 2, segmentCount: 100 })
            ),
            result(
                "uploading",
                ["GET /api/userInfo", "POST /api/skipSegments"],
                JSON.stringify({ userName: "second", viewCount: 5, minutesSaved: 3, segmentCount: 7 })
            ),
        ]);

        expect(response).toMatchObject({
            ok: true,
            partial: false,
            stats: { userName: "first", viewCount: 15, minutesSaved: 5, segmentCount: 7 },
            successfulBackendIds: ["query-only", "uploading"],
        });
    });

    test("keeps successful data when one backend fails and preserves zero values", () => {
        const response = aggregateUserWorkStats([
            result(
                "working",
                ["GET /api/userInfo", "POST /api/skipSegments"],
                JSON.stringify({ viewCount: 0, minutesSaved: 0, segmentCount: 0 })
            ),
            result("failed", ["GET /api/userInfo", "POST /api/skipSegments"], "", false),
        ]);

        expect(response).toMatchObject({
            ok: true,
            partial: true,
            stats: { viewCount: 0, minutesSaved: 0, segmentCount: 0 },
            failedBackendIds: ["failed"],
        });
    });

    test("returns no data when every backend fails", () => {
        expect(
            aggregateUserWorkStats([result("failed", ["GET /api/userInfo"], "not-json", false)])
        ).toMatchObject({ ok: false, failedBackendIds: ["failed"] });
    });
});
