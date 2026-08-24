import type { BrowserContext } from "@playwright/test";

export type MockVideoLabel = {
    videoID: string;
    category: string;
};

export type MockSponsorSegment = {
    segment: [number, number];
    UUID: string;
    category: string;
    actionType: "skip" | "mute" | "full" | "poi";
    cid: string;
    videoDuration: number;
};

export async function routeMockSponsorSegments(
    context: BrowserContext,
    bvid: string,
    segments: MockSponsorSegment[]
): Promise<void> {
    await context.route("https://www.bsbsb.top/api/skipSegments/**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json; charset=utf-8",
            body: JSON.stringify([{ videoID: bvid, segments }]),
        });
    });
}

export async function routeMockVideoLabels(
    context: BrowserContext,
    labels: MockVideoLabel[],
    onRequest?: (url: string) => void
): Promise<void> {
    await context.route("https://www.bsbsb.top/api/videoLabels/**", async (route) => {
        onRequest?.(route.request().url());
        await route.fulfill({
            status: 200,
            contentType: "application/json; charset=utf-8",
            body: JSON.stringify(
                labels.map(({ videoID, category }) => ({
                    videoID,
                    segments: [{ category }],
                }))
            ),
        });
    });
}
