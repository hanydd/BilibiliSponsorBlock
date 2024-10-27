import Config from "../config";
import { getHash } from "../utils/hash";
import { FetchResponse } from "./background-request-proxy";
import { asyncRequestToServer } from "./requests";

export async function setUsername(inputUserName: string): Promise<FetchResponse> {
    const response = asyncRequestToServer(
        "POST",
        "/api/setUsername?userID=" + Config.config.userID + "&username=" + inputUserName
    );

    getUserInfo("", true);

    return response;
}

export async function getUserInfo(userID: string, ignoreServerCache: boolean = false): Promise<FetchResponse> {
    if (!userID) {
        userID = await getHash(Config.config.userID);
    }
    return asyncRequestToServer(
        "GET",
        "/api/userInfo",
        {
            publicUserID: userID,
            values: ["userName", "viewCount", "minutesSaved", "vip", "permissions", "segmentCount"],
        },
        ignoreServerCache
    );
}
