import { BVID } from "../src/types";
import { CalculateAvidToBvid, CalculateBvidToAvid } from "../src/utils/bvidAvidUtils";
const testCases: [number | string, BVID][] = [
    [2, "BV1xx411c7mD" as BVID],
    ["170001", "BV17x411w7KC" as BVID],
    ["455017605", "BV1Q541167Qg" as BVID],
    [882584971, "BV1mK4y1C7Bz" as BVID],
    ["80433022", "BV1GJ411x7h7" as BVID],
    [713984017, "BV18X4y1N7Yh" as BVID],
    [113864347752328, "BV1CDwbeEE46" as BVID],
];

describe("AV号转BV号", () => {
    testCases.forEach(([avid, bvid]) => {
        test(`av${avid} -> ${bvid}`, () => {
            expect(CalculateAvidToBvid(avid)).toBe(bvid);
        });
    });
});

describe("BV号转AV号", () => {
    testCases.forEach(([avid, bvid]) => {
        test(`${bvid} -> av${avid}`, () => {
            expect(CalculateBvidToAvid(bvid)).toBe(Number(avid));
        });
    });
});
