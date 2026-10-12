import { BVID, Category, SponsorTime } from "../../types";
import type { BackendInfoMap } from "../../backends/types";

export interface FetchResponse {
    responseText: string;
    status: number;
    ok: boolean;
}

export interface SegmentResponse {
    segments: SponsorTime[] | null;
    /** Original candidates retained independently of category, display and action filters. */
    rawSegments?: SponsorTime[];
    status: number;
    backendInfo?: BackendInfoMap;
}

export type LabelBlock = Record<BVID, Category>;
