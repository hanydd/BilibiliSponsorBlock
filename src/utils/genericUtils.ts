/* Gets percieved luminance of a color */
function getLuminance(color: string): number {
    const { r, g, b } = hexToRgb(color);
    return Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    hex = hex.toLowerCase();

    // Expand short format (#rgb or #rgba) to full form
    if (hex.length === 4 || hex.length === 5) {
        hex = "#" + hex.slice(1).split("").map(c => c + c).join("");
    }

    // Now hex should be 7 (#rrggbb) or 9 (#rrggbbaa)
    if (hex.length === 7 || hex.length === 9) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b }; // Ignore alpha channel for luminance
    }

    return null;
}

/**
 * List of all indexes that have the specified value
 * https://stackoverflow.com/a/54954694/1985387
 */
function indexesOf<T>(array: T[], value: T): number[] {
    return array.map((v, i) => (v === value ? i : -1)).filter((i) => i !== -1);
}

export const GenericUtils = {
    getLuminance,
    indexesOf,
};
