import { CalculateAvidToBvid } from "../src/utils/bvidAvidUtils";
const testCases: [number | string, string][] = [
    [2, "BV1xx411c7mD"],
    ["170001", "BV17x411w7KC"],
    ["455017605", "BV1Q541167Qg"],
    [882584971, "BV1mK4y1C7Bz"],
    ["80433022", "BV1GJ411x7h7"],
    [713984017, "BV18X4y1N7Yh"],
    [113864347752328, "BV1CDwbeEE46"],
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
            expect(CalculateAvidToBvid(avid)).toBe(bvid);
        });
    });
});
