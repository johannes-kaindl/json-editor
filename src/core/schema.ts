import Ajv, { type ErrorObject } from "ajv";
import type { JsonValue, JsonPath } from "./types";

export interface PathError {
  path: JsonPath;
  message: string;
}

export interface CompiledSchema {
  validate: (value: JsonValue) => PathError[];
}

export type SchemaCompileResult =
  | { ok: true; schema: CompiledSchema }
  | { ok: false; error: string };

export function compileSchema(text: string): SchemaCompileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Schema is not valid JSON: ${(e as Error).message}` };
  }

  const ajv = new Ajv({ strict: false, allErrors: true, verbose: false });
  let validateFn: ReturnType<Ajv["compile"]>;
  try {
    validateFn = ajv.compile(parsed as object);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const validate = (value: JsonValue): PathError[] => {
    const ok = validateFn(value);
    if (ok) return [];
    const errs = validateFn.errors ?? [];
    return errs.map((e) => ({
      path: instancePathToJsonPath(e.instancePath, value, e),
      message: ajvErrorMessage(e),
    }));
  };

  return { ok: true, schema: { validate } };
}

function ajvErrorMessage(e: ErrorObject): string {
  const base = e.message ?? "validation error";
  // For missing-required, append which property to make the message useful.
  if (e.keyword === "required" && e.params && typeof e.params === "object") {
    const params = e.params as { missingProperty?: string };
    if (params.missingProperty) {
      return `missing required property "${params.missingProperty}"`;
    }
  }
  return base;
}

/**
 * Convert Ajv's JSON-Pointer instancePath into our JsonPath segment array.
 * Examples:
 *   ""              → []
 *   "/foo"          → ["foo"]
 *   "/arr/2"        → ["arr", 2]
 *   "/a~1b"         → ["a/b"]   (~1 decodes to /)
 *   "/c~0d"         → ["c~d"]   (~0 decodes to ~)
 *
 * The original value is consulted to disambiguate array indices (numeric
 * segments are arr-indices when the parent at that depth is an array).
 */
function instancePathToJsonPath(
  pointer: string,
  rootValue: JsonValue,
  _err: ErrorObject
): JsonPath {
  if (pointer === "") return [];
  const rawSegments = pointer.split("/").slice(1).map(decodePointerSegment);
  const result: JsonPath = [];
  let cur: JsonValue = rootValue;
  for (const seg of rawSegments) {
    if (Array.isArray(cur)) {
      const idx = parseInt(seg, 10);
      result.push(idx);
      cur = cur[idx];
    } else if (cur !== null && typeof cur === "object") {
      result.push(seg);
      cur = (cur as Record<string, JsonValue>)[seg];
    } else {
      // Fell off the value tree — keep raw segment as fallback.
      result.push(seg);
    }
  }
  return result;
}

function decodePointerSegment(seg: string): string {
  return seg.replace(/~1/g, "/").replace(/~0/g, "~");
}
