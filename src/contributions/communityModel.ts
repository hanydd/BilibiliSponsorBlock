import { isTopSegment, TopSegment } from "./model";

export interface CommunitySavedUser {
    publicUserID: string;
    userName: string;
    skips: number;
    savedMs: number;
}
export interface CommunitySubmittingUser {
    publicUserID: string;
    userName: string;
    submissions: number;
    videos: number;
}
export interface CommunityStats {
    apiVersion: 1;
    today: string;
    timezone: "Asia/Shanghai";
    generatedAt: string;
    collectionStartedAt: string;
    totals: { skips: number; savedMs: number; contributors: number };
    topSaved: CommunitySavedUser[];
    topSubmissions: CommunitySubmittingUser[];
    topSegments: TopSegment[];
}
export function isCommunityStats(value: unknown): value is CommunityStats {
    const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
    const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
    const timestamp = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
    const user = (v: unknown): v is Record<string, unknown> => object(v) && typeof v.publicUserID === "string"
        && /^[a-f0-9]{64}$/.test(v.publicUserID) && typeof v.userName === "string" && v.userName.length <= 512;
    if (!object(value) || value.apiVersion !== 1 || value.timezone !== "Asia/Shanghai"
        || typeof value.today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.today)
        || !Number.isFinite(Date.parse(value.today)) || new Date(value.today).toISOString().slice(0,10) !== value.today
        || !timestamp(value.generatedAt) || !timestamp(value.collectionStartedAt)
        || !object(value.totals) || !count(value.totals.skips) || !count(value.totals.savedMs) || !count(value.totals.contributors)
        || !Array.isArray(value.topSaved) || value.topSaved.length > 5
        || !Array.isArray(value.topSubmissions) || value.topSubmissions.length > 5
        || !Array.isArray(value.topSegments) || value.topSegments.length > 10
        || !value.topSegments.every(isTopSegment)
        || new Set(value.topSegments.map((row) => row.uuid)).size !== value.topSegments.length) return false;
    return value.topSaved.every((row) => user(row) && count(row.skips) && count(row.savedMs))
        && value.topSubmissions.every((row) => user(row) && count(row.submissions) && count(row.videos));
}
