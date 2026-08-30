import { BVID, Category, SponsorTime } from "../../types";
import type { BackendInfoMap } from "../../backends/types";

export interface FetchResponse {
    responseText: string;
    status: number;
    ok: boolean;
}

export interface SegmentResponse {
    segments: SponsorTime[] | null;
    status: number;
    backendInfo?: BackendInfoMap;
}

export type LabelBlock = Record<BVID, Category>;
