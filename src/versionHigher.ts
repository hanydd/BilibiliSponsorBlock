export function versionHigher(newVersion: string, oldVersion: string): boolean {
    const newVersionParts = newVersion.split(".");
    const oldVersionParts = oldVersion.split(".");
    if (newVersionParts.length !== oldVersionParts.length) return true;

    for (let i = 0; i < newVersionParts.length; i++) {
        const newVersionPart = parseInt(newVersionParts[i]);
        const oldVersionPart = parseInt(oldVersionParts[i]);

        if (newVersionPart > oldVersionPart) {
            return true;
        } else if (newVersionPart < oldVersionPart) {
            return false;
        }
    }

    return false;
}