import Config from "../../config";
import { generateUserID } from "../../utils/setup";
import { asyncRequestToServer } from "../background-request-proxy";

export async function submitVote(type: number, UUID: string, category: string) {
    let userID = Config.config.userID;

    if (userID == undefined || userID === "undefined") {
        //generate one
        userID = generateUserID();
        Config.config.userID = userID;
    }

    const typeSection = type !== undefined ? "&type=" + type : "&category=" + category;

    try {
        const response = await asyncRequestToServer(
            "POST",
            "/api/voteOnSponsorTime?UUID=" + UUID + "&userID=" + userID + typeSection
        );

        if (response.ok) {
            return {
                successType: 1,
                responseText: await response.text(),
            };
        } else if (response.status == 405) {
            //duplicate vote
            return {
                successType: 0,
                statusCode: response.status,
                responseText: await response.text(),
            };
        } else {
            //error while connect
            return {
                successType: -1,
                statusCode: response.status,
                responseText: await response.text(),
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
