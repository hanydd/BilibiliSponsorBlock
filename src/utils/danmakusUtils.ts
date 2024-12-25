import Config from "../config";

/**
 * 解析弹幕文本中的目标时间
 *
 * @param text 输入需要解析的弹幕文本
 * @param currentTime 弹幕出现的时间
 * @returns 返回弹幕指向目标时间。若无法解析，则会返回null。
 */
export function parseTargetTimeFromDanmaku(text: string, currentTime: number) {
    /**
     * 解析时间字符串并将其转换为总秒数。
     *
     * @param text - 包含需要解析的时间的输入字符串。
     * @returns 由时间字符串表示的总秒数，如果时间字符串无效则返回null。
     *
     * 该函数使用在 `Config.config.danmakuTimeMatchingRegexPattern` 中定义的正则表达式模式
     * 来匹配和提取输入字符串中的小时、分钟和秒。如果匹配成功且有效，
     * 它通过将小时转换为秒、分钟转换为秒并将它们加到解析的秒数中来计算总秒数。
     */
    function parseTime(text: string) {
        const regex = new RegExp(Config.config.danmakuTimeMatchingRegexPattern, "g");

        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            const [, , minutes, seconds, secondsSuffix] = match;

            if (seconds && (secondsSuffix || minutes)) {
                const hours = parseInt(match[1] || "0");
                const minutes = parseInt(match[2] || "0");
                const seconds = parseInt(match[3] || "0");
                return hours * 3600 + minutes * 60 + seconds;
            }
        }

        return null;
    }

    /**
     * 解析弹幕文本中的偏移时间。
     *
     * @param text - 包含偏移时间的弹幕文本。
     * @returns 如果找到匹配的偏移时间，返回偏移时间（以秒为单位）；否则返回 null。
     *
     * @remarks
     * 该函数使用配置中的正则表达式模式来匹配偏移时间。匹配的偏移时间格式类似于“向右x下”，
     * 其中 x 是一个整数，表示偏移的时间单位。偏移时间等价于当前时间加上 5 倍的 x 秒。
     */
    function parseOffsetTime(text: string) {
        const regex = new RegExp(Config.config.danmakuOffsetMatchingRegexPattern, "g");

        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            const [, direction, offset, suffix] = match;

            if (offset && (direction || suffix)) {
                // “向右x下”等价于当前时间 + 5x秒
                return parseInt(offset) * 5;
            }
        }

        return null;
    }

    text = text.replace(/[零一二三四五六七八九两壹贰叁肆伍陆柒捌玖十百千万]+/g, (cnNum) => parseChineseNumber(cnNum));

    const directParsedTime = parseTime(text);
    if (directParsedTime) return directParsedTime;
    else {
        const offsetParsedTime = parseOffsetTime(text);
        if (offsetParsedTime) return offsetParsedTime + currentTime;
    }
    return null;
}

/**
 * 将中文数字字符串转换为阿拉伯数字字符串。
 *
 * @param inputText - 包含中文数字的字符串。
 * @returns 转换后的阿拉伯数字字符串。如果输入包含无效字符，则返回 null。
 *
 * @example
 * ```typescript
 * parseChineseNumber("一"); // 返回 "1"
 * parseChineseNumber("十二"); // 返回 "12"
 * parseChineseNumber("二十"); // 返回 "20"
 * parseChineseNumber("二十一"); // 返回 "21"
 * parseChineseNumber("一百"); // 返回 null
 * ```
 */
export function parseChineseNumber(inputText: string) {
    const cnChrMap: { [key: string]: number } = {
        零: 0,
        一: 1,
        二: 2,
        三: 3,
        四: 4,
        五: 5,
        六: 6,
        七: 7,
        八: 8,
        九: 9,
        两: 2,
        壹: 1,
        贰: 2,
        叁: 3,
        肆: 4,
        伍: 5,
        陆: 6,
        柒: 7,
        捌: 8,
        玖: 9,
    };

    const cnUnitMap: { [key: string]: number } = {
        十: 10,
    };

    let num = 0;
    let unit = 1;
    for (let i = 0; i < inputText.length; i++) {
        const chr = inputText[i];
        if (chr in cnChrMap) {
            num += cnChrMap[chr] * unit;
        } else if (chr in cnUnitMap) {
            unit = cnUnitMap[chr];
            if (num === 0 && unit === 10) {
                num = 1;
            }
            num = num * unit;
            unit = 1;
        } else {
            return null;
        }
    }

    return num.toString();
}
