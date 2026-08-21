import * as CompileBackends from "../../backends.json";
import { BackendConfigDocument, BackendEnabledMap } from "./types";
import { assertValidBackendConfigDocument } from "./validator";

const compileDefaultDocument = CompileBackends as unknown as BackendConfigDocument;

export function getDefaultBackendConfig(): BackendConfigDocument {
    assertValidBackendConfigDocument(compileDefaultDocument);
    return JSON.parse(JSON.stringify(compileDefaultDocument)) as BackendConfigDocument;
}
/** Keep per-backend switches separate from the JSON document. New backends default to enabled. */
export function normalizeBackendEnabledMap(
    document: BackendConfigDocument,
    enabledMap: Readonly<BackendEnabledMap> = {}
): BackendEnabledMap {
    return document.backends.reduce<BackendEnabledMap>((result, backend) => {
        result[backend.id] = enabledMap[backend.id] !== false;
        return result;
    }, {});
}
