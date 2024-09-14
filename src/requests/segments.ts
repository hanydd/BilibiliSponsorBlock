import { asyncRequestToServer } from "./requests";

export async function getSegmentsByHash(
    hashPrefix: string,
    extraRequestData: Record<string, unknown>,
    ignoreServerCache: boolean
) {
    const response = await asyncRequestToServer(
        "GET",
        "/api/skipSegments/" + hashPrefix,
        extraRequestData,
        ignoreServerCache
    );

    return response;
}
