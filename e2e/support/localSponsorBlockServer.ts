export type LocalServerSegment = {
    UUID: string;
    videoID: string;
    cid: string;
    startTime: number | string;
    endTime: number | string;
    category: string;
    actionType: string;
    videoDuration: number | string;
    service: string;
    userAgent: string;
};

export const localSponsorBlockServerUrl = (process.env.BSB_E2E_LOCAL_SERVER_URL || "http://127.0.0.1:9876").replace(
    /\/$/,
    ""
);
const localServerHostname = new URL(localSponsorBlockServerUrl).hostname;
if (!["127.0.0.1", "localhost", "[::1]"].includes(localServerHostname)) {
    throw new Error(
        `Refusing to run @local-server tests against non-loopback address ${localSponsorBlockServerUrl}.`
    );
}

export async function assertLocalSponsorBlockServerReady(): Promise<void> {
    let response: Response;
    try {
        response = await fetch(`${localSponsorBlockServerUrl}/api/status`, {
            signal: AbortSignal.timeout(5_000),
        });
    } catch (error) {
        throw new Error(
            `Local SponsorBlockServer is not reachable at ${localSponsorBlockServerUrl}. ` +
                `Start it with \`npm run start\` before running this test. ` +
                `Original error: ${error instanceof Error ? error.message : String(error)}`
        );
    }

    if (!response.ok) {
        throw new Error(
            `Local SponsorBlockServer health check returned HTTP ${response.status} at ${localSponsorBlockServerUrl}.`
        );
    }
}

export async function getLocalServerSegment(UUID: string): Promise<LocalServerSegment> {
    const response = await fetch(
        `${localSponsorBlockServerUrl}/api/segmentInfo?UUID=${encodeURIComponent(UUID)}`,
        { signal: AbortSignal.timeout(10_000) }
    );
    if (!response.ok) {
        throw new Error(`Unable to read submitted segment ${UUID}: HTTP ${response.status}.`);
    }

    const segments = (await response.json()) as LocalServerSegment[];
    if (segments.length !== 1) {
        throw new Error(`Expected one submitted segment for ${UUID}, received ${segments.length}.`);
    }

    return segments[0];
}
