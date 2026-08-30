import { BackendConfig, BackendConfigDocument } from "./types";

function cloneDocument(document: BackendConfigDocument): BackendConfigDocument {
    return JSON.parse(JSON.stringify(document)) as BackendConfigDocument;
}

function unique<T>(values: readonly T[]): T[] {
    return [...new Set(values)];
}

/**
 * Return a copy with conflict declarations deduplicated and made symmetric.
 * Unknown IDs are retained so the validator can report them to the user.
 */
export function normalizeBackendConflicts(document: BackendConfigDocument): BackendConfigDocument {
    const normalized = cloneDocument(document);
    const backendsById = new Map<string, BackendConfig>();

    for (const backend of normalized.backends) {
        if (typeof backend !== "object" || backend === null || Array.isArray(backend)) continue;
        if (typeof backend.id === "string") backendsById.set(backend.id, backend);
        if (Array.isArray(backend.conflicts)) backend.conflicts = unique(backend.conflicts);
    }

    for (const backend of normalized.backends) {
        if (typeof backend !== "object" || backend === null || Array.isArray(backend)) continue;
        if (!Array.isArray(backend.conflicts)) continue;
        if (typeof backend.id !== "string") continue;
        for (const conflictId of backend.conflicts ?? []) {
            if (typeof conflictId !== "string") continue;
            const conflictBackend = backendsById.get(conflictId);
            if (!conflictBackend || conflictBackend.id === backend.id) continue;
            if (conflictBackend.conflicts !== undefined && !Array.isArray(conflictBackend.conflicts)) continue;
            if (!conflictBackend.conflicts?.includes(backend.id)) {
                conflictBackend.conflicts = [...(conflictBackend.conflicts ?? []), backend.id];
            }
        }
    }

    return normalized;
}
