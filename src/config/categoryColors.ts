import { PreviewBarOption } from "../types";

/** 存储正常颜色、预览颜色；业务代码仍使用 { color, opacity }。 */
export type StoredBarColors = Record<string, [string | null, string | null]>;
export type RuntimeColors = Record<string, PreviewBarOption>;

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** 读入新格式或旧备份，补齐默认颜色；透明度始终取内存默认值。 */
export function decodeBarColors(value: unknown, defaults: RuntimeColors): RuntimeColors {
    const colors = Object.fromEntries(Object.entries(defaults).map(([key, entry]) => [key, { ...entry }]));
    const setColor = (key: string, color: unknown) => {
        if (color === null) delete colors[key];
        else if (typeof color === "string") colors[key] = { color, opacity: defaults[key]?.opacity ?? "0.7" };
    };

    for (const [key, entry] of Object.entries(asRecord(value))) {
        if (Array.isArray(entry)) {
            setColor(key, entry[0]);
            setColor(`preview-${key}`, entry[1]);
        } else {
            setColor(key, asRecord(entry).color);
        }
    }
    return colors;
}

export function encodeBarColors(value: RuntimeColors): StoredBarColors {
    const colors: StoredBarColors = {};
    for (const [key, { color }] of Object.entries(value)) {
        const preview = key.startsWith("preview-");
        const category = preview ? key.slice("preview-".length) : key;
        colors[category] ??= [null, null];
        colors[category][preview ? 1 : 0] = color;
    }
    return colors;
}

export function decodeDynamicSponsorColors(value: unknown, defaults: RuntimeColors): RuntimeColors {
    const colors: RuntimeColors = {};
    for (const [key, entry] of Object.entries({ ...defaults, ...asRecord(value) })) {
        const color = asRecord(entry).color;
        const fallback = defaults[key];
        if (typeof color === "string" || fallback) {
            colors[key] = { color: typeof color === "string" ? color : fallback.color, opacity: fallback?.opacity ?? "0.7" };
        }
    }
    return colors;
}

export function encodeDynamicSponsorColors(value: RuntimeColors): Record<string, { color: string }> {
    return Object.fromEntries(Object.entries(value).map(([key, { color }]) => [key, { color }]));
}
