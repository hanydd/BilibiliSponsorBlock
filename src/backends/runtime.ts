import * as CompileBackends from "../../backends.json";
import { BackendConfig, BackendConfigDocument, BackendEnabledMap, BackendInfoMap } from "./types";
import { assertValidBackendConfigDocument } from "./validator";

const compileDefaultDocument = CompileBackends as unknown as BackendConfigDocument;

export function getDefaultBackendConfig(): BackendConfigDocument {
    assertValidBackendConfigDocument(compileDefaultDocument);
    return JSON.parse(JSON.stringify(compileDefaultDocument)) as BackendConfigDocument;
}
/** Keep only explicit per-backend overrides; missing IDs follow the JSON `enabled` value. */
export function normalizeBackendEnabledMap(
    document: BackendConfigDocument,
    enabledMap: Readonly<BackendEnabledMap> = {}
): BackendEnabledMap {
    const ids = new Set(document.backends.map((backend) => backend.id));
    return Object.fromEntries(
        Object.entries(enabledMap).filter(([id, enabled]) => ids.has(id) && typeof enabled === "boolean")
    );
}

export function isBackendEnabled(
    backend: Pick<BackendConfig, "id" | "enabled">,
    enabledMap: Readonly<BackendEnabledMap> = {}
): boolean {
    return Object.prototype.hasOwnProperty.call(enabledMap, backend.id)
        ? enabledMap[backend.id]
        : backend.enabled !== false;
}

export function createBackendInfoMap(backends: readonly BackendConfig[]): BackendInfoMap {
    return Object.fromEntries(
        backends.map((backend) => [backend.id, {
            backendId: backend.id,
            name: backend.name,
            capabilities: [...backend.capabilities],
        }])
    );
}
