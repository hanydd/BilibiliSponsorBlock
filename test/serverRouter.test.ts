import { ServerRouter, ServerRouterState } from "../src/requests/serverRouter";
import { FetchResponse } from "../src/requests/type/requestType";

const PRIMARY = "https://primary.test";
const MIRROR = "http://mirror.test:9876";
const SECOND_MIRROR = "https://second-mirror.test";
const HASH_ENDPOINT = "/api/skipSegments/abcd";

function response(status: number, responseText = status === 200 ? "[]" : ""): FetchResponse {
    return {
        status,
        responseText,
        ok: status >= 200 && status < 300,
    };
}

describe("ServerRouter", () => {
    let now: number;
    let executeRequest: jest.Mock<Promise<FetchResponse>>;
    let savedState: ServerRouterState | null;

    function createRouter(addresses = [PRIMARY, MIRROR]): ServerRouter {
        return new ServerRouter({
            getServerAddresses: () => addresses,
            executeRequest,
            loadState: async () => savedState,
            saveState: async (state) => {
                savedState = JSON.parse(JSON.stringify(state));
            },
            now: () => now,
            random: () => 0.5,
            hashRequestTimeoutMs: 1000,
            otherRequestTimeoutMs: 1000,
        });
    }

    beforeEach(() => {
        now = 0;
        savedState = null;
        executeRequest = jest.fn();
    });

    test("retries a failed hash request and switches to the successful mirror", async () => {
        executeRequest.mockResolvedValueOnce(response(-1)).mockResolvedValueOnce(response(200));
        const router = createRouter();

        await expect(router.request("GET", HASH_ENDPOINT)).resolves.toEqual(response(200));

        expect(executeRequest).toHaveBeenCalledTimes(2);
        expect(executeRequest.mock.calls[0][1]).toBe(PRIMARY + HASH_ENDPOINT);
        expect(executeRequest.mock.calls[1][1]).toBe(MIRROR + HASH_ENDPOINT);

        const status = await router.getStatus();
        expect(status.activeAddress).toBe(MIRROR);
        expect(status.nodes[0].state).toBe("open");
        expect(status.nodes[0].healthState).toBe("open");
        expect(status.nodes[1]).toMatchObject({ active: true, state: "active", healthState: "available" });
    });

    test("tries every configured healthy node for a retryable hash failure", async () => {
        const addresses = [
            PRIMARY,
            MIRROR,
            SECOND_MIRROR,
            "https://third-mirror.test",
            "https://fourth-mirror.test",
        ];
        executeRequest
            .mockResolvedValueOnce(response(-1))
            .mockResolvedValueOnce(response(503))
            .mockResolvedValueOnce(response(200, "invalid"))
            .mockResolvedValueOnce(response(408))
            .mockResolvedValueOnce(response(200));
        const router = createRouter(addresses);

        await expect(router.request("GET", HASH_ENDPOINT)).resolves.toEqual(response(200));

        expect(executeRequest.mock.calls.map((call) => call[1])).toEqual(
            addresses.map((address) => address + HASH_ENDPOINT)
        );
        expect((await router.getStatus()).activeAddress).toBe(addresses[addresses.length - 1]);
    });

    test("stops retrying hash requests on a business response", async () => {
        executeRequest.mockResolvedValueOnce(response(-1)).mockResolvedValueOnce(response(429));
        const router = createRouter([PRIMARY, MIRROR, SECOND_MIRROR]);

        await expect(router.request("GET", HASH_ENDPOINT)).resolves.toEqual(response(429));
        expect(executeRequest).toHaveBeenCalledTimes(2);
    });

    test("waits for server addresses before sending a request", async () => {
        let resolveAddresses: (addresses: string[]) => void;
        const addresses = new Promise<string[]>((resolve) => {
            resolveAddresses = resolve;
        });
        executeRequest.mockResolvedValue(response(200));
        const router = new ServerRouter({
            getServerAddresses: () => addresses,
            executeRequest,
            loadState: async () => savedState,
            saveState: async () => undefined,
            now: () => now,
        });

        const request = router.request("GET", HASH_ENDPOINT);
        await Promise.resolve();
        await Promise.resolve();
        expect(executeRequest).not.toHaveBeenCalled();

        resolveAddresses([PRIMARY, MIRROR]);
        await expect(request).resolves.toEqual(response(200));
        expect(executeRequest).toHaveBeenCalledWith(
            "GET",
            PRIMARY + HASH_ENDPOINT,
            {},
            {},
            expect.any(AbortSignal)
        );
    });

    test("coalesces identical segment and label hash requests", async () => {
        executeRequest.mockResolvedValue(response(200));
        const router = createRouter();

        const first = router.request("GET", "/api/videoLabels/abcd");
        const second = router.request("GET", "/api/videoLabels/abcd");

        await expect(Promise.all([first, second])).resolves.toEqual([response(200), response(200)]);
        expect(executeRequest).toHaveBeenCalledTimes(1);
    });

    test("does not coalesce different hash requests", async () => {
        executeRequest.mockResolvedValue(response(200));
        const router = createRouter();

        await Promise.all([
            router.request("GET", "/api/skipSegments/abcd"),
            router.request("GET", "/api/skipSegments/efgh"),
        ]);

        expect(executeRequest).toHaveBeenCalledTimes(2);
    });

    test("does not coalesce retryable non-hash reads", async () => {
        executeRequest.mockResolvedValue(response(200));
        const router = createRouter();

        await Promise.all([
            router.request("GET", "/api/userInfo", { publicUserID: "test" }),
            router.request("GET", "/api/userInfo", { publicUserID: "test" }),
        ]);

        expect(executeRequest).toHaveBeenCalledTimes(2);
    });

    test("retries a safe read on one healthy alternative", async () => {
        executeRequest.mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200));
        const router = createRouter([PRIMARY, MIRROR, SECOND_MIRROR]);

        await expect(router.request("GET", "/api/userInfo", { publicUserID: "test" })).resolves.toEqual(
            response(200)
        );
        expect(executeRequest.mock.calls.map((call) => call[1])).toEqual([
            PRIMARY + "/api/userInfo",
            MIRROR + "/api/userInfo",
        ]);
        expect((await router.getStatus()).activeAddress).toBe(MIRROR);
    });

    test("does not retry a safe read on more than one alternative", async () => {
        executeRequest.mockResolvedValue(response(503));
        const router = createRouter([PRIMARY, MIRROR, SECOND_MIRROR]);

        await expect(router.request("GET", "/api/chapterNames")).resolves.toEqual(response(503));
        expect(executeRequest).toHaveBeenCalledTimes(2);
        expect(executeRequest.mock.calls.map((call) => call[1])).toEqual([
            PRIMARY + "/api/chapterNames",
            MIRROR + "/api/chapterNames",
        ]);
    });

    test("does not coalesce side-effect GET requests", async () => {
        executeRequest.mockResolvedValue(response(200));
        const router = createRouter();

        await Promise.all([
            router.request("GET", "/api/viewedVideoSponsorTime?UUID=test"),
            router.request("GET", "/api/viewedVideoSponsorTime?UUID=test"),
        ]);

        expect(executeRequest).toHaveBeenCalledTimes(2);
    });

    test("does not retry a side-effect GET request", async () => {
        executeRequest.mockResolvedValue(response(-1));
        const router = createRouter();

        await expect(router.request("GET", "/api/viewedVideoSponsorTime?UUID=test")).resolves.toEqual(response(-1));
        expect(executeRequest).toHaveBeenCalledTimes(1);
        expect((await router.getStatus()).activeAddress).toBe(MIRROR);
    });

    test("records a server error without replaying a side-effect request", async () => {
        executeRequest.mockResolvedValue(response(503));
        const router = createRouter();

        await expect(router.request("POST", "/api/voteOnSponsorTime", { UUID: "test" })).resolves.toEqual(
            response(503)
        );

        expect(executeRequest).toHaveBeenCalledTimes(1);
        expect((await router.getStatus()).activeAddress).toBe(MIRROR);
        expect((await router.getStatus()).nodes[0].healthState).toBe("open");
    });

    test("does not retry a business 4xx response", async () => {
        executeRequest.mockResolvedValue(response(429));
        const router = createRouter();

        await expect(router.request("GET", HASH_ENDPOINT)).resolves.toEqual(response(429));
        expect(executeRequest).toHaveBeenCalledTimes(1);
        expect((await router.getStatus()).activeAddress).toBe(PRIMARY);
    });

    test("counts concurrent failures as one breaker event", async () => {
        const finishPrimaryRequests: Array<(value: FetchResponse) => void> = [];
        let resolvePrimaryRequestsStarted: () => void;
        const primaryRequestsStarted = new Promise<void>((resolve) => {
            resolvePrimaryRequestsStarted = resolve;
        });
        executeRequest.mockImplementation((type, url) => {
            if (url.startsWith(PRIMARY)) {
                return new Promise((resolve) => {
                    finishPrimaryRequests.push(resolve);
                    if (finishPrimaryRequests.length === 4) resolvePrimaryRequestsStarted();
                });
            }
            return Promise.resolve(response(200));
        });
        const router = createRouter();

        const requests = [
            router.request("GET", "/api/skipSegments/abcd"),
            router.request("GET", "/api/skipSegments/efgh"),
            router.request("GET", "/api/videoLabels/1234"),
            router.request("GET", "/api/videoLabels/5678"),
        ];
        await primaryRequestsStarted;
        expect(finishPrimaryRequests).toHaveLength(4);
        finishPrimaryRequests.forEach((finish) => finish(response(-1)));
        await expect(Promise.all(requests)).resolves.toHaveLength(4);

        expect(savedState?.health[PRIMARY].backoffLevel).toBe(1);
        expect(savedState?.health[PRIMARY].openUntil).toBe(15 * 60 * 1000);
    });

    test("checks one configured node without probing the other nodes", async () => {
        executeRequest.mockResolvedValue(response(-1));
        const router = createRouter();

        const status = await router.probe(MIRROR);

        expect(executeRequest).toHaveBeenCalledTimes(1);
        expect(executeRequest.mock.calls[0][1]).toBe(MIRROR + "/api/ready");
        expect(status.nodes[1].state).toBe("open");
        expect(status.activeAddress).toBe(PRIMARY);
    });

    test("checks an unconfigured address without adding it to the router", async () => {
        const candidate = "https://candidate.test";
        executeRequest.mockResolvedValue(response(200, "OK"));
        const router = createRouter();

        await expect(router.checkAddress(candidate)).resolves.toEqual({
            address: candidate,
            healthState: "available",
        });

        expect(executeRequest).toHaveBeenCalledWith("GET", candidate + "/api/ready", {}, {}, expect.any(AbortSignal));
        expect((await router.getStatus()).nodes.map((node) => node.address)).toEqual([PRIMARY, MIRROR]);
    });

    test("requires a successful response from the ready endpoint", async () => {
        executeRequest.mockResolvedValue(response(404));
        const router = createRouter();

        await expect(router.checkAddress("https://candidate.test")).resolves.toMatchObject({ healthState: "open" });
    });

    test("manual recovery checks still require two spaced successes before switching back", async () => {
        executeRequest.mockResolvedValueOnce(response(-1)).mockResolvedValueOnce(response(200));
        const router = createRouter();
        await router.request("GET", HASH_ENDPOINT);

        now = 15 * 60 * 1000;
        executeRequest.mockResolvedValue(response(200, "OK"));
        await router.probe(PRIMARY);
        await router.probe(PRIMARY);

        expect((await router.getStatus()).activeAddress).toBe(MIRROR);
        expect((await router.getStatus()).nodes[0].recoverySuccesses).toBe(1);

        now += 5 * 60 * 1000;
        await router.probe(PRIMARY);

        expect((await router.getStatus()).activeAddress).toBe(PRIMARY);
    });

    test("uses a safe read as a recovery probe", async () => {
        executeRequest.mockResolvedValueOnce(response(-1)).mockResolvedValueOnce(response(200));
        const router = createRouter();
        await router.request("GET", HASH_ENDPOINT);

        now = 15 * 60 * 1000;
        executeRequest.mockClear();
        executeRequest.mockResolvedValueOnce(response(200));
        await router.request("GET", "/api/lockCategories/abcd");

        expect(executeRequest).toHaveBeenCalledTimes(1);
        expect(executeRequest.mock.calls[0][1]).toBe(PRIMARY + "/api/lockCategories/abcd");
        expect((await router.getStatus()).nodes[0]).toMatchObject({
            active: false,
            healthState: "recovering",
            recoverySuccesses: 1,
        });
        expect((await router.getStatus()).activeAddress).toBe(MIRROR);
    });

    test("recovers a single node after two spaced successful requests", async () => {
        const router = createRouter([PRIMARY]);
        executeRequest.mockResolvedValueOnce(response(-1));
        await router.request("GET", HASH_ENDPOINT);

        executeRequest.mockResolvedValue(response(200));
        now = 1;
        await router.request("GET", HASH_ENDPOINT);
        expect((await router.getStatus()).nodes[0]).toMatchObject({
            healthState: "recovering",
            recoverySuccesses: 1,
        });

        now += 5 * 60 * 1000;
        await router.request("GET", HASH_ENDPOINT);
        expect((await router.getStatus()).nodes[0]).toMatchObject({
            active: true,
            healthState: "available",
            recoverySuccesses: 0,
        });
        expect(savedState?.health[PRIMARY].backoffLevel).toBe(0);
    });

    test("rotates across every failed node and recovers a mirror", async () => {
        executeRequest.mockResolvedValueOnce(response(-1)).mockResolvedValueOnce(response(-1));
        let router = createRouter();
        await router.request("GET", HASH_ENDPOINT);
        expect((await router.getStatus()).nodes.every((node) => node.healthState === "open")).toBe(true);

        executeRequest.mockClear();
        executeRequest.mockResolvedValueOnce(response(200));
        await router.request("GET", HASH_ENDPOINT);
        expect(executeRequest.mock.calls[0][1]).toBe(MIRROR + HASH_ENDPOINT);
        expect((await router.getStatus()).nodes[1]).toMatchObject({
            healthState: "recovering",
            recoverySuccesses: 1,
        });
        expect((await router.getStatus()).activeAddress).toBe(PRIMARY);

        router = createRouter();
        now += 5 * 60 * 1000;
        executeRequest.mockResolvedValueOnce(response(-1)).mockResolvedValueOnce(response(200));
        await router.request("GET", HASH_ENDPOINT);
        await router.request("GET", HASH_ENDPOINT);

        expect(executeRequest.mock.calls.slice(-2).map((call) => call[1])).toEqual([
            PRIMARY + HASH_ENDPOINT,
            MIRROR + HASH_ENDPOINT,
        ]);
        expect((await router.getStatus()).nodes[1]).toMatchObject({
            active: true,
            healthState: "available",
        });
        expect((await router.getStatus()).activeAddress).toBe(MIRROR);
    });

    test("probes one failed node per request while rotating through all configured nodes", async () => {
        executeRequest
            .mockResolvedValueOnce(response(-1))
            .mockResolvedValueOnce(response(-1))
            .mockResolvedValueOnce(response(-1));
        const router = createRouter([PRIMARY, MIRROR, SECOND_MIRROR]);

        await router.request("GET", HASH_ENDPOINT);
        expect((await router.getStatus()).nodes.every((node) => node.healthState === "open")).toBe(true);

        executeRequest.mockClear();
        executeRequest.mockResolvedValue(response(-1));
        await router.request("GET", "/api/skipSegments/first");
        await router.request("GET", "/api/skipSegments/second");
        await router.request("GET", "/api/skipSegments/third");

        expect(executeRequest.mock.calls.map((call) => call[1])).toEqual([
            MIRROR + "/api/skipSegments/first",
            SECOND_MIRROR + "/api/skipSegments/second",
            PRIMARY + "/api/skipSegments/third",
        ]);
    });

    test("requires two spaced successful probes before switching back", async () => {
        executeRequest.mockResolvedValueOnce(response(-1)).mockResolvedValueOnce(response(200));
        const router = createRouter();
        await router.request("GET", HASH_ENDPOINT);

        now = 15 * 60 * 1000;
        executeRequest.mockResolvedValueOnce(response(200));
        await router.request("GET", HASH_ENDPOINT);
        expect((await router.getStatus()).activeAddress).toBe(MIRROR);
        expect((await router.getStatus()).nodes[0].recoverySuccesses).toBe(1);

        now += 4 * 60 * 1000;
        executeRequest.mockResolvedValueOnce(response(200));
        await router.request("GET", HASH_ENDPOINT);
        expect(executeRequest.mock.calls[executeRequest.mock.calls.length - 1][1]).toBe(MIRROR + HASH_ENDPOINT);

        now += 60 * 1000;
        executeRequest.mockResolvedValueOnce(response(200));
        await router.request("GET", HASH_ENDPOINT);
        expect(executeRequest.mock.calls[executeRequest.mock.calls.length - 1][1]).toBe(PRIMARY + HASH_ENDPOINT);
        expect((await router.getStatus()).activeAddress).toBe(PRIMARY);
    });

    test("does not select a recovering node after only one successful probe", async () => {
        executeRequest.mockResolvedValueOnce(response(-1)).mockResolvedValueOnce(response(200));
        const router = createRouter();
        await router.request("GET", HASH_ENDPOINT);

        now = 15 * 60 * 1000;
        executeRequest.mockResolvedValueOnce(response(200));
        await router.request("GET", HASH_ENDPOINT);
        expect((await router.getStatus()).nodes[0]).toMatchObject({
            active: false,
            healthState: "recovering",
            recoverySuccesses: 1,
        });

        executeRequest.mockClear();
        executeRequest.mockResolvedValueOnce(response(503));
        await expect(router.request("GET", HASH_ENDPOINT)).resolves.toEqual(response(503));
        expect(executeRequest).toHaveBeenCalledTimes(1);
        expect(executeRequest.mock.calls[0][1]).toBe(MIRROR + HASH_ENDPOINT);
        expect((await router.getStatus()).activeAddress).toBe(MIRROR);

        now += 5 * 60 * 1000;
        executeRequest.mockResolvedValueOnce(response(200));
        await router.request("GET", HASH_ENDPOINT);
        expect((await router.getStatus()).activeAddress).toBe(PRIMARY);
    });

    test("allows only one recovery probe at a time", async () => {
        executeRequest.mockResolvedValueOnce(response(-1)).mockResolvedValueOnce(response(200));
        const router = createRouter();
        await router.request("GET", HASH_ENDPOINT);

        now = 15 * 60 * 1000;
        executeRequest.mockClear();
        let finishProbe: (value: FetchResponse) => void;
        executeRequest.mockImplementation((type, url) => {
            if (url.startsWith(PRIMARY)) {
                return new Promise((resolve) => {
                    finishProbe = resolve;
                });
            }
            return Promise.resolve(response(200));
        });

        const probe = router.request("GET", "/api/skipSegments/abcd");
        await Promise.resolve();
        await Promise.resolve();
        const concurrentRequest = router.request("GET", "/api/videoLabels/efgh");

        await expect(concurrentRequest).resolves.toEqual(response(200));
        finishProbe(response(200));
        await expect(probe).resolves.toEqual(response(200));

        const recoveryCalls = executeRequest.mock.calls.filter((call) => call[1].startsWith(PRIMARY));
        expect(recoveryCalls).toHaveLength(1);
        expect((await router.getStatus()).activeAddress).toBe(MIRROR);
        expect((await router.getStatus()).nodes[0].recoverySuccesses).toBe(1);
    });

    test("keeps serving from the mirror when a recovery probe fails", async () => {
        executeRequest.mockResolvedValueOnce(response(-1)).mockResolvedValueOnce(response(200));
        const router = createRouter();
        await router.request("GET", HASH_ENDPOINT);

        now = 15 * 60 * 1000;
        executeRequest.mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200));

        await expect(router.request("GET", HASH_ENDPOINT)).resolves.toEqual(response(200));
        expect(executeRequest.mock.calls[executeRequest.mock.calls.length - 2][1]).toBe(PRIMARY + HASH_ENDPOINT);
        expect(executeRequest.mock.calls[executeRequest.mock.calls.length - 1][1]).toBe(MIRROR + HASH_ENDPOINT);

        const primary = (await router.getStatus()).nodes[0];
        expect(primary.openUntil).toBe(now + 60 * 60 * 1000);
    });

    test("sends later writes to the active mirror without replaying them", async () => {
        executeRequest.mockResolvedValueOnce(response(-1)).mockResolvedValueOnce(response(200));
        const router = createRouter();
        await router.request("GET", HASH_ENDPOINT);

        executeRequest.mockResolvedValueOnce(response(503));
        await expect(router.request("POST", "/api/voteOnSponsorTime", { UUID: "test" })).resolves.toEqual(
            response(503)
        );

        expect(executeRequest.mock.calls[executeRequest.mock.calls.length - 1][1]).toBe(
            MIRROR + "/api/voteOnSponsorTime"
        );
        expect(executeRequest).toHaveBeenCalledTimes(3);
    });

    test("retries a 200 hash response with invalid JSON", async () => {
        executeRequest.mockResolvedValueOnce(response(200, "invalid")).mockResolvedValueOnce(response(200));
        const router = createRouter();

        await expect(router.request("GET", HASH_ENDPOINT)).resolves.toEqual(response(200));
        expect(executeRequest).toHaveBeenCalledTimes(2);
    });

    test("restores the active node and circuit state after a background restart", async () => {
        executeRequest.mockResolvedValueOnce(response(-1)).mockResolvedValueOnce(response(200));
        const router = createRouter();
        await router.request("GET", HASH_ENDPOINT);

        const restoredRouter = createRouter();
        const status = await restoredRouter.getStatus();

        expect(status.activeAddress).toBe(MIRROR);
        expect(status.nodes[0].state).toBe("open");
    });

    test("preserves health and the active node when mirrors change", async () => {
        const addresses = [PRIMARY, MIRROR];
        executeRequest.mockResolvedValueOnce(response(-1)).mockResolvedValueOnce(response(200));
        const router = createRouter(addresses);
        await router.request("GET", HASH_ENDPOINT);

        addresses.push(SECOND_MIRROR);
        let status = await router.getStatus();
        expect(status.activeAddress).toBe(MIRROR);
        expect(status.nodes.find((node) => node.address === PRIMARY)?.healthState).toBe("open");

        addresses.splice(addresses.indexOf(MIRROR), 1);
        status = await router.getStatus();
        expect(status.activeAddress).toBe(SECOND_MIRROR);
        expect(status.nodes.find((node) => node.address === PRIMARY)?.healthState).toBe("open");
    });
});
