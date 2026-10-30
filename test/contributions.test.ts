import {
    calendarDates,
    calendarRangeLabel,
    contributionCalendarDates,
    duration,
    intensity,
    segmentTime,
    segmentVideoUrl,
    isContributionStats,
} from "../src/contributions/model";

test("calendar includes leap day without timezone-dependent dates", () => {
    expect(calendarDates(2024)).toHaveLength(366);
    expect(calendarDates(2024)[59]).toBe("2024-02-29");
    expect(calendarDates(2025)).toHaveLength(365);
    expect(calendarDates(2025)[364]).toBe("2025-12-31");
});
test("legend distinguishes no submissions from activity and has stable thresholds", () => {
    expect([0, 1, 2, 3, 5, 6, 9, 10, 100].map(intensity)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
});
test("short saved durations are not shown as zero hours", () => {
    expect(duration(9000)).toBe("9 秒");
    expect(duration(120000)).toBe("2 分钟");
    expect(duration(5400000)).toBe("1.5 小时");
});

test("segment links only use Bilibili video IDs and nonnegative offsets", () => {
    expect(segmentVideoUrl("BV1xx411c7mD", 65.2, 3)).toBe("https://www.bilibili.com/video/BV1xx411c7mD/?p=3&t=65");
    expect(segmentVideoUrl("javascript:alert(1)", 0)).toBeNull();
    expect(segmentTime(65.9)).toBe("1:05");
});

test("unknown part links to the video without seeking into the wrong part", () => {
    expect(segmentVideoUrl("BV1xx411c7mD", 65)).toBe("https://www.bilibili.com/video/BV1xx411c7mD/");
});
const response = () => ({
    apiVersion: 1,
    publicUserID: "a".repeat(64),
    year: 2026,
    userName: "test",
    todaySubmissions: 2,
    today: "2026-10-30",
    detailStart: "2026-10-24",
    timezone: "Asia/Shanghai",
    generatedAt: "2026-10-30T03:00:00Z",
    collectionStartedAt: "2026-01-01T00:00:00Z",
    submissionBasis: "existing_segments",
    submissions: [],
    categories: [],
    topSegments: { bySkips: [], bySavedMs: [] },
    impact: Array.from({ length: 90 }, (_, i) => ({
        date: new Date(Date.parse("2026-10-30") - (89 - i) * 86400000).toISOString().slice(0, 10),
        skips: 0,
        savedMs: 0,
        status: i === 89 ? "partial" : "complete",
    })),
});
test("validates complete responses and rejects cached data belonging to another identity/year", () => {
    expect(isContributionStats(response(), "a".repeat(64), 2026)).toBe(true);
    expect(isContributionStats(response(), "b".repeat(64), 2026)).toBe(false);
    expect(isContributionStats(response(), "a".repeat(64), 2025)).toBe(false);
});
test.each([
    { categories: null },
    { topSegments: { bySkips: [{}], bySavedMs: [] } },
    { impact: [] },
    { todaySubmissions: NaN },
    { todaySubmissions: Number.MAX_SAFE_INTEGER + 1 },
    { today: "2026-02-30" },
    { apiVersion: 2 },
])("rejects malformed remote data without rendering it: %p", (change) => {
    expect(isContributionStats({ ...response(), ...change }, "a".repeat(64), 2026)).toBe(false);
});


test("current calendar is a full trailing year ending today", () => {
    const dates = contributionCalendarDates(2026, "2026-10-30");
    expect(dates).toHaveLength(365);
    expect(dates[0]).toBe("2025-10-31");
    expect(dates[364]).toBe("2026-10-30");
    expect(dates.every((date) => date <= "2026-10-30")).toBe(true);
});
test("calendar starts in 2024 and retains leap day and historical years", () => {
    expect(contributionCalendarDates(2023, "2026-10-30")).toEqual([]);
    expect(contributionCalendarDates(2027, "2026-10-30")).toEqual([]);
    expect(contributionCalendarDates(2024, "2024-01-01")).toEqual(["2024-01-01"]);
    expect(contributionCalendarDates(2024, "2024-03-01")).toContain("2024-02-29");
    expect(contributionCalendarDates(2024, "2026-10-30")).toHaveLength(366);
    expect(contributionCalendarDates(2025, "2025-01-01")[364]).toBe("2025-01-01");
});

test("calendar labels collapse only complete calendar years", () => {
    expect(calendarRangeLabel(calendarDates(2025))).toBe("2025年");
    expect(calendarRangeLabel(calendarDates(2024))).toBe("2024年");
    expect(calendarRangeLabel(contributionCalendarDates(2026, "2026-11-01"))).toBe("2025-11-02 至 2026-11-01");
    expect(calendarRangeLabel(["2026-01-01"])).toBe("2026-01-01 至 2026-01-01");
    expect(calendarRangeLabel([])).toBe("");
});
