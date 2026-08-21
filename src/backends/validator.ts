import {
    BackendConfig,
    BACKEND_REQUEST_CAPABILITIES,
    BackendConfigDocument,
    BackendMatchField,
    BackendRequestCapability,
} from "./types";

export interface BackendConfigValidationResult {
    valid: boolean;
    errors: string[];
}

const ID_PATTERN = /^[a-z_-]+$/;
const MATCH_FIELDS: readonly BackendMatchField[] = ["title", "description", "up_mid", "up_name"];
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: unknown): value is string {
    if (typeof value !== "string" || value.length === 0) return false;
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function validateStringArray(value: unknown, path: string, errors: string[]): value is string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        errors.push(`${path} must be an array of strings`);
        return false;
    }
    return true;
}

function validateExpression(value: unknown, path: string, errors: string[], ancestors: Set<unknown>): void {
    if (!isRecord(value)) {
        errors.push(`${path} must be an object`);
        return;
    }
    if (ancestors.has(value)) {
        errors.push(`${path} contains a circular reference`);
        return;
    }

    const keys = Object.keys(value);
    const operators = ["field", "exact", "regexp", "and", "or", "not"];
    const unknownKeys = keys.filter((key) => !operators.includes(key));
    if (unknownKeys.length > 0) {
        errors.push(`${path} contains unknown field(s): ${unknownKeys.join(", ")}`);
    }

    const hasExact = Object.prototype.hasOwnProperty.call(value, "exact");
    const hasRegexp = Object.prototype.hasOwnProperty.call(value, "regexp");
    const hasLogical = ["and", "or", "not"].filter((key) => Object.prototype.hasOwnProperty.call(value, key));
    const isLeaf = hasExact || hasRegexp || Object.prototype.hasOwnProperty.call(value, "field");

    if (isLeaf && (hasLogical.length > 0 || keys.some((key) => !["field", "exact", "regexp"].includes(key)))) {
        errors.push(`${path} must be one leaf matcher or one logical operator`);
        return;
    }

    if (isLeaf) {
        if (typeof value.field !== "string" || !MATCH_FIELDS.includes(value.field as BackendMatchField)) {
            errors.push(`${path}.field must be one of ${MATCH_FIELDS.join(", ")}`);
        }
        if (hasExact === hasRegexp) {
            errors.push(`${path} must contain exactly one of exact or regexp`);
        }
        if (hasExact) validateStringArray(value.exact, `${path}.exact`, errors);
        if (hasRegexp) {
            if (typeof value.regexp !== "string") {
                errors.push(`${path}.regexp must be a string`);
            } else {
                try {
                    new RegExp(value.regexp);
                } catch {
                    errors.push(`${path}.regexp is not a valid regular expression`);
                }
            }
        }
        return;
    }

    if (hasLogical.length !== 1) {
        errors.push(`${path} must contain exactly one of and, or, or not`);
        return;
    }

    const operator = hasLogical[0];
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(value);
    if (operator === "not") {
        validateExpression(value.not, `${path}.not`, errors, nextAncestors);
        return;
    }

    if (!Array.isArray(value[operator])) {
        errors.push(`${path}.${operator} must be an array`);
        return;
    }
    value[operator].forEach((child, index) => validateExpression(child, `${path}.${operator}[${index}]`, errors, nextAncestors));
}

function validateBackend(value: unknown, index: number, allIds: Set<string>, errors: string[]): value is BackendConfig {
    const path = `backends[${index}]`;
    if (!isRecord(value)) {
        errors.push(`${path} must be an object`);
        return false;
    }

    const requiredFields = ["id", "name", "api_url", "capabilities"];
    for (const field of requiredFields) {
        if (!Object.prototype.hasOwnProperty.call(value, field)) errors.push(`${path}.${field} is required`);
    }
    const allowedFields = ["id", "name", "desc", "api_url", "capabilities", "match", "mirrors", "conflicts"];
    const unknownFields = Object.keys(value).filter((key) => !allowedFields.includes(key));
    if (unknownFields.length > 0) errors.push(`${path} contains unknown field(s): ${unknownFields.join(", ")}`);

    if (typeof value.id !== "string" || !ID_PATTERN.test(value.id)) {
        errors.push(`${path}.id must contain only lowercase letters, underscores, and hyphens`);
    } else if (allIds.has(value.id)) {
        errors.push(`${path}.id must be unique`);
    } else {
        allIds.add(value.id);
    }
    if (typeof value.name !== "string" || value.name.length === 0) errors.push(`${path}.name must be a non-empty string`);
    if (value.desc !== undefined && typeof value.desc !== "string") errors.push(`${path}.desc must be a string`);
    if (!isHttpUrl(value.api_url)) errors.push(`${path}.api_url must be an http(s) URL`);

    if (!Array.isArray(value.capabilities) || value.capabilities.length === 0) {
        errors.push(`${path}.capabilities must be a non-empty array`);
    } else {
        const seen = new Set<string>();
        value.capabilities.forEach((capability, capabilityIndex) => {
            if (!BACKEND_REQUEST_CAPABILITIES.includes(capability as BackendRequestCapability)) {
                errors.push(`${path}.capabilities[${capabilityIndex}] is not a supported capability`);
            } else if (seen.has(capability as string)) {
                errors.push(`${path}.capabilities must not contain duplicates`);
            } else {
                seen.add(capability as string);
            }
        });
    }

    if (value.match !== undefined) {
        if (!Array.isArray(value.match)) {
            errors.push(`${path}.match must be an array`);
        } else {
            value.match.forEach((expression, expressionIndex) =>
                validateExpression(expression, `${path}.match[${expressionIndex}]`, errors, new Set())
            );
        }
    }
    if (value.mirrors !== undefined) {
        if (validateStringArray(value.mirrors, `${path}.mirrors`, errors)) {
            const seen = new Set<string>();
            value.mirrors.forEach((mirror, mirrorIndex) => {
                if (!isHttpUrl(mirror)) errors.push(`${path}.mirrors[${mirrorIndex}] must be an http(s) URL`);
                if (seen.has(mirror)) errors.push(`${path}.mirrors must not contain duplicates`);
                seen.add(mirror);
            });
        }
    }
    if (value.conflicts !== undefined) {
        if (validateStringArray(value.conflicts, `${path}.conflicts`, errors)) {
            const seen = new Set<string>();
            value.conflicts.forEach((conflict, conflictIndex) => {
                if (conflict === value.id) errors.push(`${path}.conflicts[${conflictIndex}] cannot reference itself`);
                if (seen.has(conflict)) errors.push(`${path}.conflicts must not contain duplicates`);
                seen.add(conflict);
            });
        }
    }
    return true;
}

export function validateBackendConfigDocument(value: unknown): BackendConfigValidationResult {
    const errors: string[] = [];
    if (!isRecord(value)) return { valid: false, errors: ["configuration must be an object"] };
    if (Object.keys(value).some((key) => key !== "backends")) errors.push("configuration contains unknown fields");
    if (!Array.isArray(value.backends)) {
        errors.push("backends must be an array");
    } else {
        const ids = new Set<string>();
        value.backends.forEach((backend, index) => validateBackend(backend, index, ids, errors));
        value.backends.forEach((backend, index) => {
            if (!isRecord(backend) || !validateStringArray(backend.conflicts, `backends[${index}].conflicts`, [])) return;
            backend.conflicts.forEach((conflict, conflictIndex) => {
                if (!ids.has(conflict)) errors.push(`backends[${index}].conflicts[${conflictIndex}] references an unknown backend ID`);
            });
        });
    }
    return { valid: errors.length === 0, errors };
}

export function assertValidBackendConfigDocument(value: unknown): asserts value is BackendConfigDocument {
    const result = validateBackendConfigDocument(value);
    if (!result.valid) throw new Error(`Invalid backend configuration: ${result.errors.join("; ")}`);
}
