import { SponsorTime } from "../types";

/** HTTP methods represented in backend capabilities. */
export type BackendHttpMethod = "GET" | "POST";

/** Exact HTTP method and API path pairs actually called by the extension. */
export const BACKEND_REQUEST_CAPABILITIES = [
    "GET /api/skipSegments",
    "GET /api/skipSegments/:sha256HashPrefix",
    "POST /api/skipSegments",
    "POST /api/voteOnSponsorTime",
    "POST /api/viewedVideoSponsorTime",
    "GET /api/lockCategories",
    "GET /api/lockCategories/:sha256HashPrefix",
    "GET /api/videoLabels",
    "GET /api/videoLabels/:sha256HashPrefix",
    "GET /api/portVideo",
    "GET /api/portVideo/:sha256HashPrefix",
    "POST /api/portVideo",
    "POST /api/votePort",
    "POST /api/updatePortedSegments",
    "GET /api/chapterNames",
    "GET /api/userInfo",
    "POST /api/setUsername",
    "GET /api/getUsername",
    "POST /api/warnUser",
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

/** Runtime metadata exposed to the popup for the current video's matched backends. */
export interface BackendInfo {
    backendId: string;
    name: string;
    capabilities: BackendRequestCapability[];
}

export type BackendInfoMap = Record<string, BackendInfo>;

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
