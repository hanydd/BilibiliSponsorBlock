/** Log the operation and browser error without including stored user data. */
export function logLocalStorageError(
    operation: "get" | "set" | "remove",
    key: string,
    error: { message?: string }
): void {
    console.error(`[BilibiliSponsorBlock] storage.local.${operation} failed`, {
        key,
        message: error.message,
    });
}
