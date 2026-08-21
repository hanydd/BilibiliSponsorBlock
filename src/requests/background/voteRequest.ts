import Config from "../../config";
import { generateUserID } from "../../utils/setup";
import { callAPIWithOptions } from "../background-request-proxy";

export async function submitVote(type: number, UUID: string, category: string, backendId?: string) {
    let userID = Config.config.userID;

    if (userID == undefined || userID === "undefined") {
        //generate one
        userID = generateUserID();
        Config.config.userID = userID;
    }

    const typeSection = type !== undefined ? "&type=" + type : "&category=" + category;

    try {
        const response = await callAPIWithOptions(
            "POST",
            "/api/voteOnSponsorTime?UUID=" + UUID + "&userID=" + userID + typeSection,
            {},
            { backendId }
        );

        if (response.ok) {
            return {
                successType: 1,
                responseText: response.responseText,
            };
        } else if (response.status == 405) {
            //duplicate vote
            return {
                successType: 0,
                statusCode: response.status,
                responseText: response.responseText,
            };
        } else {
            //error while connect
            return {
                successType: -1,
                statusCode: response.status,
                responseText: response.responseText,
            };
        }
    } catch (e) {
        console.error(e);
        return {
            successType: -1,
            statusCode: -1,
            responseText: "",
        };
    }
}
