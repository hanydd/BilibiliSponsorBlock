import { BackendConfig, BackendHttpMethod, BackendRequestCapability } from "./types";

export type BackendOperation =
    | "querySegments"
    | "querySegmentsByHash"
    | "submitSegments"
    | "voteOnSponsorTime"
    | "submitViewedVideoSponsorTime"
    | "queryLockCategories"
    | "queryLockCategoriesByHash"
    | "queryVideoLabels"
    | "queryVideoLabelsByHash"
    | "queryPortVideo"
    | "queryPortVideoByHash"
    | "submitPortVideo"
    | "submitPortVote"
    | "submitPortedSegments"
    | "queryChapterNames"
    | "queryUserInfo"
    | "setUsername"
    | "queryUsername"
    | "warnUser";

export interface BackendOperationDefinition {
    method: BackendHttpMethod;
    capability: BackendRequestCapability;
}

export const BACKEND_OPERATIONS: Record<BackendOperation, BackendOperationDefinition> = {
    querySegments: { method: "GET", capability: "GET /api/skipSegments" },
    querySegmentsByHash: { method: "GET", capability: "GET /api/skipSegments/:sha256HashPrefix" },
    submitSegments: { method: "POST", capability: "POST /api/skipSegments" },
    voteOnSponsorTime: { method: "POST", capability: "POST /api/voteOnSponsorTime" },
    submitViewedVideoSponsorTime: { method: "POST", capability: "POST /api/viewedVideoSponsorTime" },
    queryLockCategories: { method: "GET", capability: "GET /api/lockCategories" },
    queryLockCategoriesByHash: { method: "GET", capability: "GET /api/lockCategories/:sha256HashPrefix" },
    queryVideoLabels: { method: "GET", capability: "GET /api/videoLabels" },
    queryVideoLabelsByHash: { method: "GET", capability: "GET /api/videoLabels/:sha256HashPrefix" },
    queryPortVideo: { method: "GET", capability: "GET /api/portVideo" },
    queryPortVideoByHash: { method: "GET", capability: "GET /api/portVideo/:sha256HashPrefix" },
    submitPortVideo: { method: "POST", capability: "POST /api/portVideo" },
    submitPortVote: { method: "POST", capability: "POST /api/votePort" },
    submitPortedSegments: { method: "POST", capability: "POST /api/updatePortedSegments" },
    queryChapterNames: { method: "GET", capability: "GET /api/chapterNames" },
    queryUserInfo: { method: "GET", capability: "GET /api/userInfo" },
    setUsername: { method: "POST", capability: "POST /api/setUsername" },
    queryUsername: { method: "GET", capability: "GET /api/getUsername" },
    warnUser: { method: "POST", capability: "POST /api/warnUser" },
};

function getPathWithoutQuery(endpoint: string): string {
    return endpoint.split("?", 1)[0].replace(/\/$/, "");
}

export function getBackendOperation(type: string, endpoint: string): BackendOperation | null {
    const method = type.toUpperCase();
    const path = getPathWithoutQuery(endpoint);

    if (path === "/api/skipSegments") return method === "GET" ? "querySegments" : method === "POST" ? "submitSegments" : null;
    if (path.startsWith("/api/skipSegments/")) return method === "GET" ? "querySegmentsByHash" : null;
    if (path === "/api/lockCategories") return method === "GET" ? "queryLockCategories" : null;
    if (path.startsWith("/api/lockCategories/")) return method === "GET" ? "queryLockCategoriesByHash" : null;
    if (path === "/api/videoLabels") return method === "GET" ? "queryVideoLabels" : null;
    if (path.startsWith("/api/videoLabels/")) return method === "GET" ? "queryVideoLabelsByHash" : null;
    if (path === "/api/portVideo") return method === "GET" ? "queryPortVideo" : method === "POST" ? "submitPortVideo" : null;
    if (path.startsWith("/api/portVideo/")) return method === "GET" ? "queryPortVideoByHash" : null;
    if (path === "/api/voteOnSponsorTime") return method === "POST" ? "voteOnSponsorTime" : null;
    if (path === "/api/viewedVideoSponsorTime") return method === "POST" ? "submitViewedVideoSponsorTime" : null;
    if (path === "/api/votePort") return method === "POST" ? "submitPortVote" : null;
    if (path === "/api/updatePortedSegments") return method === "POST" ? "submitPortedSegments" : null;
    if (path === "/api/chapterNames") return method === "GET" ? "queryChapterNames" : null;
    if (path === "/api/userInfo") return method === "GET" ? "queryUserInfo" : null;
    if (path === "/api/setUsername") return method === "POST" ? "setUsername" : null;
    if (path === "/api/getUsername") return method === "GET" ? "queryUsername" : null;
    if (path === "/api/warnUser") return method === "POST" ? "warnUser" : null;

    return null;
}

export function getBackendCapability(operation: BackendOperation): BackendRequestCapability {
    return BACKEND_OPERATIONS[operation].capability;
}

export function supportsBackendOperation(
    backend: Pick<BackendConfig, "capabilities">,
    operation: BackendOperation
): boolean {
    return backend.capabilities.includes(getBackendCapability(operation));
}
