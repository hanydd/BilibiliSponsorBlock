/**
 * 工具函数：BV号与AV号相互转换
 * 算法来源：@catlair (https://github.com/SocialSisterYi/bilibili-API-collect/)
 */

import { BVID } from "../types";

const XOR_CODE = BigInt("23442827791579");
const MASK_CODE = BigInt("2251799813685247");
const MAX_AVID = BigInt(1) << BigInt(51);
const BASE = BigInt(58);

const ALPHABET = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";

export function CalculateBvidToAvid(bvid: BVID): number {
    const bvidArr = Array.from<string>(bvid);
    [bvidArr[3], bvidArr[9]] = [bvidArr[9], bvidArr[3]];
    [bvidArr[4], bvidArr[7]] = [bvidArr[7], bvidArr[4]];
    bvidArr.splice(0, 3);
    const avidVal = bvidArr.reduce((previousVal, bvidChar) => previousVal * BASE + BigInt(ALPHABET.indexOf(bvidChar)), BigInt(0));
    return Number((avidVal & MASK_CODE) ^ XOR_CODE);
}

export function CalculateAvidToBvid(avid: number | string): BVID {
    if (typeof avid === "string") {
        if (avid.startsWith("av")) avid = avid.replace("av", "");
        avid = parseInt(avid);
    }

    const bvidArr = ["B", "V", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
    let bvIndex = bvidArr.length - 1;
    let tmp = (MAX_AVID | BigInt(avid)) ^ XOR_CODE;
    while (tmp > 0) {
        bvidArr[bvIndex] = ALPHABET[Number(tmp % BigInt(BASE))];
        tmp = tmp / BASE;
        bvIndex -= 1;
    }
    [bvidArr[3], bvidArr[9]] = [bvidArr[9], bvidArr[3]];
    [bvidArr[4], bvidArr[7]] = [bvidArr[7], bvidArr[4]];
    return bvidArr.join("") as BVID;
}
