import { BVID, Category, SponsorTime } from "../../types";

export interface FetchResponse {
    responseText: string;
    status: number;
    ok: boolean;
}

export interface SegmentResponse {
    segments: SponsorTime[] | null;
    status: number;
}

export type LabelBlock = Record<BVID, Category>;
