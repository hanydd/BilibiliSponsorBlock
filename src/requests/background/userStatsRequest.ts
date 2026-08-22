import { BackendRequestResult, requestFromBackends } from "../backendRouter";
import { supportsBackendOperation } from "../../backends";
import { UserWorkStats, UserWorkStatsResponse } from "../../messageTypes";
import { FetchResponse } from "../type/requestType";

const USER_INFO_VALUES = ["userName", "viewCount", "minutesSaved", "vip", "permissions", "segmentCount"];

function emptyResponse(): UserWorkStatsResponse {
    return {
        ok: false,
        partial: false,
        successfulBackendIds: [],
        failedBackendIds: [],
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validNonNegativeNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseUserInfo(response: FetchResponse): Record<string, unknown> | null {
    if (!response.ok) return null;
    try {
        const parsed: unknown = JSON.parse(response.responseText);
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function aggregateUserWorkStats(results: BackendRequestResult[]): UserWorkStatsResponse {
    const successful: Array<{ result: BackendRequestResult; info: Record<string, unknown> }> = [];
    const failedBackendIds: string[] = [];

    for (const result of results) {
        const info = parseUserInfo(result.response);
        if (info) successful.push({ result, info });
        else failedBackendIds.push(result.backendId);
    }

    if (successful.length === 0) return { ...emptyResponse(), failedBackendIds };

    const first = successful[0].info;
    const stats: UserWorkStats = {};
    let viewCount = 0;
    let minutesSaved = 0;
    let segmentCount = 0;
    let hasViewCount = false;
    let hasMinutesSaved = false;
    let hasSegmentCount = false;

    for (const { result, info } of successful) {
        if (validNonNegativeNumber(info.viewCount)) {
            viewCount += info.viewCount;
            hasViewCount = true;
        }
        if (validNonNegativeNumber(info.minutesSaved)) {
            minutesSaved += info.minutesSaved;
            hasMinutesSaved = true;
        }
        if (supportsBackendOperation(result.backend, "submitSegments") && validNonNegativeNumber(info.segmentCount)) {
            segmentCount += info.segmentCount;
            hasSegmentCount = true;
        }
    }

    if (hasViewCount) stats.viewCount = viewCount;
    if (hasMinutesSaved) stats.minutesSaved = minutesSaved;
    if (hasSegmentCount) stats.segmentCount = segmentCount;

    if (typeof first.userName === "string") stats.userName = first.userName;
    if (typeof first.vip === "boolean") stats.vip = first.vip;
    if (isRecord(first.permissions)) stats.permissions = first.permissions;

    return {
        ok: true,
        partial: failedBackendIds.length > 0,
        stats,
        successfulBackendIds: successful.map(({ result }) => result.backendId),
        failedBackendIds,
    };
}

export async function getUserWorkStatsBackground(
    publicUserID: string,
    skipServerCache = false
): Promise<UserWorkStatsResponse> {
    const results = await requestFromBackends(
        "GET",
        "/api/userInfo",
        { publicUserID, values: USER_INFO_VALUES },
        { operation: "queryUserInfo", skipServerCache }
    );
    return aggregateUserWorkStats(results);
}
