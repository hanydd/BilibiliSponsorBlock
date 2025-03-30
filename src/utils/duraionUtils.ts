export function durationEquals(d1: number, d2: number, tolerance = 2): boolean {
    return Math.abs(d1 - d2) < tolerance;
}