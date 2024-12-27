import { parseChineseNumber, parseTime } from "../src/utils/danmakusUtils";

describe("解析中文数字", () => {
    const chineseNumberTestCases: [string, string][] = [
        ["一", "1"],
        ["两", "2"],
        ["十", "10"],
        ["零一", "1"],
        ["叁拾", "30"],
        ["十二", "12"],
        ["二十", "20"],
        ["二十一", "21"],
        ["一百", ""],
    ];
    chineseNumberTestCases.forEach(([testCase, expectedNumber]) => {
        test(`解析中文数字 “${testCase}” `, () => {
            expect(parseChineseNumber(testCase)).toBe(expectedNumber);
        });
    });
});

describe("从弹幕解析时间", () => {
    const noTimeTestCases = ["哔哩哔哩 (゜-゜)つロ 干杯~"];
    noTimeTestCases.forEach((testCase) => {
        test(`解析无关弹幕 “${testCase}” `, () => {
            expect(parseTime(testCase)).toBe(null);
        });
    });

    const standardTimeTestCases: [string, number][] = [
        ["01:23", 83],
        ["1:23", 83],
        ["1:23:45", 5025],
    ];
    standardTimeTestCases.forEach(([testCase, expectedTime]) => {
        test(`解析标准时间格式弹幕 “${testCase}” `, () => {
            expect(parseTime(testCase)).toBe(expectedTime);
        });
    });

    const chineseTimeTestCases: [string, number][] = [
        ["1分23秒", 83],
        ["1分23", 83],
        ["1分钟整", 60],
        ["1小时23分45秒", 5025],
    ];
    chineseTimeTestCases.forEach(([testCase, expectedTime]) => {
        test(`解析中文时间格式弹幕 “${testCase}” `, () => {
            expect(parseTime(testCase)).toBe(expectedTime);
        });
    });

    const testCases = [
        { text: "友情提醒：11分23秒", expected: 683 },
        { text: "11.22", expected: 682 },
        { text: "11分钟22秒", expected: 682 },
        { text: "8分整", expected: 480 },
        { text: "8分01秒", expected: 481 },
        { text: "2分15", expected: 135 },
        { text: "7分40秒第2段", expected: 460 },
        { text: "7分39", expected: 459 },
        { text: "7.40", expected: 460 },
        { text: "跳楼7：40", expected: 460 },
        { text: "友情提醒:15分57秒", expected: 957 },
        { text: "15分58秒", expected: 958 },
        { text: "6；11", expected: 371 },
        { text: "空中力量7.22", expected: 442 },
        { text: "跳伞7:20", expected: 440 },
        { text: "8.01", expected: 481 },
    ];

    testCases.forEach(({ text, expected }) => {
        test(`弹幕实际场景测试 “${text}”`, () => {
            expect(parseTime(text)).toBe(expected);
        });
    });
});
