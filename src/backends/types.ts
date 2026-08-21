import { SponsorTime } from "../types";

/** API families actually called by the extension. */
export const BACKEND_REQUEST_CAPABILITIES = [
    "/api/skipSegments",
    "/api/voteOnSponsorTime",
    "/api/viewedVideoSponsorTime",
    "/api/lockCategories",
    "/api/videoLabels",
    "/api/portVideo",
    "/api/votePort",
    "/api/updatePortedSegments",
    "/api/chapterNames",
    "/api/userInfo",
    "/api/setUsername",
    "/api/getUsername",
    "/api/warnUser",
] as const;

export type BackendRequestCapability = (typeof BACKEND_REQUEST_CAPABILITIES)[number];

/** Alias retained for callers that use the shorter name. */
export type BackendCapability = BackendRequestCapability;

export type BackendMatchField = "title" | "description" | "up_mid" | "up_name";

export interface BackendExactMatch {
    field: BackendMatchField;
    exact: string[];
}

export interface BackendRegexpMatch {
    field: BackendMatchField;
    regexp: string;
}

export interface BackendAndMatch {
    and: BackendMatchExpression[];
}

export interface BackendOrMatch {
    or: BackendMatchExpression[];
}

export interface BackendNotMatch {
    not: BackendMatchExpression;
}

export type BackendMatchExpression =
    | BackendExactMatch
    | BackendRegexpMatch
    | BackendAndMatch
    | BackendOrMatch
    | BackendNotMatch;

export interface BackendConfig {
    id: string;
    name: string;
    desc?: string;
    api_url: string;
    /** Default runtime state; omitted means enabled. */
    enabled?: boolean;
    capabilities: BackendRequestCapability[];
    match?: BackendMatchExpression[];
    mirrors?: string[];
    conflicts?: string[];
}

export interface BackendConfigDocument {
    backends: BackendConfig[];
}

export interface VideoMatchContext {
    bvid: string;
    title: string;
    description: string;
    up_mid: string;
    up_name: string;
}

/** Runtime switches intentionally live outside BackendConfigDocument. */
export type BackendEnabledMap = Record<string, boolean>;

export interface BackendSubscriptionState {
    url: string;
    intervalMinutes: number;
    enabled: boolean;
    lastSyncAt?: number | null;
    lastError?: string | null;
}

export interface BackendRuntimeState {
    backendConfig: BackendConfigDocument;
    backendEnabledMap: BackendEnabledMap;
    backendSubscription: BackendSubscriptionState;
    lastSubmissionBackendId?: string | null;
}

export type BackendSponsorTime = SponsorTime & {
    /** Internal provenance; it is not sent as part of the SponsorBlock API payload. */
    backendId: string;
};

export interface BackendSegmentResult {
    backendId: string;
    segments: readonly SponsorTime[];
    /** Lower numbers are higher priority. Defaults to result array order. */
    priority?: number;
}
