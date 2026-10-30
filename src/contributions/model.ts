export interface TopSegment {
    uuid: string;
    videoID: string;
    cid: string;
    part: number | null;
    title: string | null;
    startTime: number;
    endTime: number;
    category: string;
    skips: number;
    savedMs: number;
}
export function isTopSegment(value: unknown): value is TopSegment {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const s = value as Record<string, unknown>;
    const text = (value: unknown, max: number) => typeof value === "string" && value.length <= max;
    const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    return text(s.uuid,128) && text(s.videoID,128) && text(s.cid,100)
        && (s.part === null || (count(s.part) && s.part > 0)) && (s.title === null || text(s.title,300))
        && typeof s.startTime === "number" && Number.isFinite(s.startTime) && s.startTime >= 0
        && typeof s.endTime === "number" && Number.isFinite(s.endTime) && s.endTime >= s.startTime
        && text(s.category,100) && count(s.skips) && count(s.savedMs);
}
export function segmentTime(seconds: number): string {
    const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
export function segmentVideoUrl(videoID: string, startTime: number, part: number | null = null): string | null {
    if (!/^(BV[0-9A-Za-z]{10}|av[0-9]+)$/.test(videoID)) return null;
    const time = Math.max(0, Math.floor(Number.isFinite(startTime) ? startTime : 0));
    return part !== null && Number.isInteger(part) && part > 0
        ? `https://www.bilibili.com/video/${videoID}/?p=${part}&t=${time}`
        : `https://www.bilibili.com/video/${videoID}/`;
}
export interface Impact {
    date: string;
    skips: number | null;
    savedMs: number | null;
    status: "complete" | "partial" | "unavailable";
}
export interface ContributionStats {
    apiVersion: 1;
    todaySubmissions: number;
    publicUserID: string;
    userName: string;
    year: number;
    today: string;
    timezone: string;
    generatedAt: string;
    collectionStartedAt: string;
    detailStart: string;
    submissionBasis: string;
    submissions: { date: string; count: number }[];
    impact: Impact[];
    topSegments: { bySkips: TopSegment[]; bySavedMs: TopSegment[] };
    categories: { date: string; category: string; skips: number; savedMs: number }[];
}
export const number = (value: number): string => value.toLocaleString("zh-CN");
export function duration(ms: number): string {
    if (ms < 60000) return `${Math.round(ms / 1000)} 秒`;
    if (ms < 3600000) return `${Math.round(ms / 60000)} 分钟`;
    return `${(ms / 3600000).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} 小时`;
}
export function calendarDates(year: number): string[] {
    const days: string[] = [];
    for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += 86400000)
        days.push(new Date(t).toISOString().slice(0, 10));
    return days;
}
/** Current year opens a trailing 365-day view; history uses calendar years. */
export function contributionCalendarDates(year: number, today: string): string[] {
    if (year < 2024) return [];
    const currentYear = Number(today.slice(0, 4));
    if (year !== currentYear) return year < currentYear ? calendarDates(year) : [];
    const end = Date.parse(`${today}T00:00:00Z`);
    const start = Math.max(Date.UTC(2024, 0, 1), end - 364 * 86400000);
    const dates: string[] = [];
    for (let time = start; time <= end; time += 86400000) dates.push(new Date(time).toISOString().slice(0, 10));
    return dates;
}

export function calendarRangeLabel(dates: string[]): string {
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (!first || !last) return "";
    const year = first.slice(0, 4);
    return first === `${year}-01-01` && last === `${year}-12-31` ? `${year}年` : `${first} 至 ${last}`;
}

export function intensity(count: number): number {
    return count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 9 ? 3 : 4;
}

/** Validate remote data before rendering it, including cached user/year isolation. */
export function isContributionStats(value: unknown, user: string, year: number): value is ContributionStats {
    const object = (v: unknown): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && !Array.isArray(v);
    const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
    const text = (v: unknown, max = 512): v is string => typeof v === "string" && v.length <= max;
    const date = (v: unknown): v is string =>
        typeof v === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(v) &&
        Number.isFinite(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v;
    if (
        !object(value) ||
        value.apiVersion !== 1 ||
        value.publicUserID !== user ||
        value.year !== year ||
        !text(value.userName) ||
        !count(value.todaySubmissions) ||
        value.timezone !== "Asia/Shanghai" ||
        !date(value.today) ||
        !date(value.detailStart) ||
        typeof value.generatedAt !== "string" ||
        !Number.isFinite(Date.parse(value.generatedAt)) ||
        typeof value.collectionStartedAt !== "string" ||
        !Number.isFinite(Date.parse(value.collectionStartedAt)) ||
        value.submissionBasis !== "existing_segments"
    )
        return false;
    const today = value.today;
    const detailStart = value.detailStart;
    if (Date.parse(value.detailStart) !== Date.parse(value.today) - 6 * 86400000) return false;
    if (
        !Array.isArray(value.submissions) ||
        value.submissions.length > 366 ||
        !value.submissions.every(
            (d) => object(d) && date(d.date) && d.date.startsWith(`${year}-`) && d.date <= today && count(d.count),
        ) ||
        new Set(value.submissions.map((d) => d.date)).size !== value.submissions.length
    )
        return false;
    if (
        !Array.isArray(value.impact) ||
        value.impact.length !== 90 ||
        !value.impact.every(
            (d, i) =>
                object(d) &&
                date(d.date) &&
                Date.parse(d.date) === Date.parse(today) - (89 - i) * 86400000 &&
                (d.status === "unavailable"
                    ? d.skips === null && d.savedMs === null
                    : (d.status === "complete" || d.status === "partial") && count(d.skips) && count(d.savedMs)),
        )
    )
        return false;
    if (
        !Array.isArray(value.categories) ||
        value.categories.length > 700 ||
        !value.categories.every(
            (d) =>
                object(d) &&
                date(d.date) &&
                d.date >= detailStart &&
                d.date <= today &&
                text(d.category, 100) &&
                count(d.skips) &&
                count(d.savedMs),
        )
    )
        return false;
    if (!object(value.topSegments)) return false;
    const top = value.topSegments;
    return ["bySkips", "bySavedMs"].every((key) => {
        const list = top[key];
        return (
            Array.isArray(list) &&
            list.length <= 10 &&
            list.every(isTopSegment)
        );
    });
}
