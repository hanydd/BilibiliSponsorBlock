import * as CompileConfig from "../../config.json";
import { ActionTypes } from "../types";
import { asyncRequestToServer } from "./requests";

export async function getSegmentsByHash(
    hashPrefix: string,
    extraRequestData: Record<string, unknown>,
    ignoreServerCache: boolean
) {
    const response = await asyncRequestToServer(
        "GET",
        "/api/skipSegments/" + hashPrefix,
        {
            categories: CompileConfig.categoryList,
            actionTypes: ActionTypes,
            ...extraRequestData,
        },
        ignoreServerCache
    );

    return response;
}
