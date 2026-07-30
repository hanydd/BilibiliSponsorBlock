import { randomInt, randomUUID } from "crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/extension";
import { readLocalStorage, readSyncStorage, writeSyncStorage } from "./support/extensionStorage";
import {
    assertLocalSponsorBlockServerReady,
    getLocalServerSegment,
    localSponsorBlockServerUrl,
} from "./support/localSponsorBlockServer";
import { openRealBilibiliPage } from "./support/realBilibili";
import { waitForBilibiliContentScript } from "./support/submissionNotice";

const submissionBvid = "BV1hUvpewEYD";
const submissionCid = "500001630059892";
const submissionVideoId = `${submissionBvid}+${submissionCid}`;
const submissionVideoUrl =
    "https://www.bilibili.com/video/BV1hUvpewEYD/?vd_source=ef7071b8c0d57f1fcef22eaecd6156e8";

type SegmentInfoResponse = {
    status?: number;
    sponsorTimes?: Array<{
        UUID?: string;
        cid?: string;
        segment: [number, number];
        category: string;
        actionType: string;
    }>;
};

type SubmissionResponse = Array<{
    UUID: string;
    category: string;
    segment: [number, number];
}>;

async function setRealVideoTime(page: Page, time: number): Promise<void> {
    const video = page.locator("#bilibili-player video").first();
    await video.evaluate(
        (element: HTMLVideoElement, nextTime: number) => {
            element.pause();
            element.currentTime = nextTime;
            element.dispatchEvent(new Event("seeking"));
            element.dispatchEvent(new Event("seeked"));
        },
        time
    );
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(time, 2);
}

test("@real @local-server submits a recorded segment to the configured local service", async ({
    extensionContext,
    extensionPage,
    extensionServiceWorker,
    sendContentMessage,
}, testInfo) => {
    testInfo.setTimeout(180_000);
    await assertLocalSponsorBlockServerReady();
    await writeSyncStorage(extensionServiceWorker, {
        autoHideInfoButton: false,
        defaultCategory: "sponsor",
        showCategoryGuidelines: false,
        sponsorTimesContributed: 0,
        testingServer: true,
        userID: `playwright-e2e-${randomUUID()}-${randomUUID()}`,
    });
    await openRealBilibiliPage(extensionPage, testInfo, submissionVideoUrl);

    const videoId = await waitForBilibiliContentScript(extensionPage, sendContentMessage);
    expect(videoId.videoID).toBe(submissionVideoId);
    await expect(extensionPage.locator("#startSegmentButton")).toBeVisible();

    const video = extensionPage.locator("#bilibili-player video").first();
    await expect
        .poll(async () => {
            const duration = await video.evaluate((element: HTMLVideoElement) => element.duration);
            return Number.isFinite(duration) ? duration : 0;
        })
        .toBeGreaterThan(65);
    const videoDuration = await video.evaluate((element: HTMLVideoElement) => element.duration);
    const latestStartTime = Math.min(220, Math.floor(videoDuration - 3));
    const startTime = randomInt(60_000, latestStartTime * 1_000) / 1_000;
    const endTime = Math.round((startTime + 1.5) * 1_000) / 1_000;

    await setRealVideoTime(extensionPage, startTime);
    await extensionPage.locator("#startSegmentButton").click();
    await expect(extensionPage.locator("#cancelSegmentButton")).toBeVisible();

    await setRealVideoTime(extensionPage, endTime);
    await extensionPage.locator("#startSegmentButton").click();
    await expect(extensionPage.locator("#submitButton")).toBeVisible();

    await expect
        .poll(async () => {
            const segments = await readLocalStorage<Record<string, Array<{ segment: number[] }>>>(
                extensionServiceWorker,
                "unsubmittedSegments"
            );
            return segments?.[submissionVideoId]?.[0]?.segment;
        })
        .toEqual([startTime, endTime]);

    await extensionPage.locator("#submitButton").click();
    const notice = extensionPage.locator("#submissionNoticeContainer");
    await expect(notice).toHaveCount(1);
    await expect(extensionPage.locator("#sponsorTimeCategoriesSubmissionNotice0")).toHaveValue("sponsor");
    await extensionPage.locator("#sponsorTimePreviewButtonSubmissionNotice0").click();

    const submitLabel = await extensionServiceWorker.evaluate(() => {
        const chromeApi = (globalThis as { chrome: typeof chrome }).chrome;
        return chromeApi.i18n.getMessage("submit");
    });
    extensionPage.on("dialog", (dialog) => void dialog.accept());
    const submissionResponsePromise = extensionContext.waitForEvent("response", {
        predicate: (response) =>
            response.url() === `${localSponsorBlockServerUrl}/api/skipSegments` &&
            response.request().method() === "POST",
        timeout: 60_000,
    });
    await notice.getByRole("button", { name: submitLabel, exact: true }).click();
    const submissionResponse = await submissionResponsePromise;
    const submissionResponseText = await submissionResponse.text();
    expect(submissionResponse.status(), submissionResponseText).toBe(200);

    const submittedSegments = JSON.parse(submissionResponseText) as SubmissionResponse;
    expect(submittedSegments).toHaveLength(1);
    expect(submittedSegments[0]).toMatchObject({
        category: "sponsor",
        segment: [startTime, endTime],
    });
    expect(submittedSegments[0].UUID).toMatch(/^[a-f0-9]{65}$/);
    await expect(notice).toHaveCount(0);

    await expect
        .poll(() =>
            readLocalStorage<Record<string, unknown[]>>(extensionServiceWorker, "unsubmittedSegments")
        )
        .toEqual({});
    await expect
        .poll(() => readSyncStorage<number>(extensionServiceWorker, "sponsorTimesContributed"))
        .toBe(1);

    await expect
        .poll(async () => {
            const info = await sendContentMessage<SegmentInfoResponse>({
                message: "isInfoFound",
                updating: false,
            });
            return info.sponsorTimes?.some(
                (segment) => segment.UUID === submittedSegments[0].UUID
            );
        })
        .toBe(true);

    const storedSegment = await getLocalServerSegment(submittedSegments[0].UUID);
    expect(storedSegment.videoID).toBe(submissionBvid);
    expect(String(storedSegment.cid)).toBe(submissionCid);
    expect(Number(storedSegment.startTime)).toBeCloseTo(startTime, 3);
    expect(Number(storedSegment.endTime)).toBeCloseTo(endTime, 3);
    expect(storedSegment.category).toBe("sponsor");
    expect(storedSegment.actionType).toBe("skip");
    expect(Number(storedSegment.videoDuration)).toBeCloseTo(videoDuration, 0);
    // SponsorBlockServer currently keeps the upstream YouTube service value for Bilibili records.
    expect(storedSegment.service).toBe("YouTube");
    expect(storedSegment.userAgent).toMatch(/\/v\d+\.\d+\.\d+$/);

    await testInfo.attach("local-server-submission", {
        body: Buffer.from(
            JSON.stringify(
                {
                    serverUrl: localSponsorBlockServerUrl,
                    UUID: storedSegment.UUID,
                    videoID: storedSegment.videoID,
                    cid: storedSegment.cid,
                    segment: [Number(storedSegment.startTime), Number(storedSegment.endTime)],
                    category: storedSegment.category,
                    actionType: storedSegment.actionType,
                    service: storedSegment.service,
                },
                null,
                2
            )
        ),
        contentType: "application/json",
    });
});
