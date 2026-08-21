import { isBackendEnabled } from "./runtime";
import { BackendConfig, BackendConfigDocument, BackendMatchExpression, VideoMatchContext } from "./types";

function matchesExpression(expression: BackendMatchExpression, context: VideoMatchContext): boolean {
    if ("and" in expression) return expression.and.every((child) => matchesExpression(child, context));
    if ("or" in expression) return expression.or.some((child) => matchesExpression(child, context));
    if ("not" in expression) return !matchesExpression(expression.not, context);

    const value = context[expression.field];
    if ("exact" in expression) return expression.exact.includes(value);
    try {
        return new RegExp(expression.regexp).test(value);
    } catch {
        return false;
    }
}

export function matchesBackend(backend: BackendConfig, context: VideoMatchContext): boolean {
    return !backend.match || backend.match.length === 0 || backend.match.every((expression) => matchesExpression(expression, context));
}

export function selectMatchedBackends(
    source: BackendConfigDocument | readonly BackendConfig[],
    context: VideoMatchContext,
    enabledMap: Readonly<Record<string, boolean>> = {}
): BackendConfig[] {
    const backends = "backends" in source ? source.backends : source;
    const selected: BackendConfig[] = [];
    const suppressed = new Set<string>();

    for (const backend of backends) {
        if (!isBackendEnabled(backend, enabledMap) || suppressed.has(backend.id) || !matchesBackend(backend, context)) continue;
        selected.push(backend);
        for (const conflictId of backend.conflicts ?? []) suppressed.add(conflictId);
    }
    return selected;
}
