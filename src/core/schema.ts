import Ajv, { type ErrorObject } from "ajv";
import type { JsonPath, JsonValue } from "./types";

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

/** Reject schemas larger than this before parsing (cheap DoS guard). */
const MAX_SCHEMA_BYTES = 1_000_000;

/**
 * Conservative nested-quantifier heuristic: a group that is itself quantified
 * and contains an inner quantifier — covering both `+`/`*` and brace forms,
 * e.g. `(a+)+`, `(x+)*`, `(.*)+`, `(a{1,}){1,}`, `(\w{2,}){2,}` — the classic
 * catastrophic-backtracking shapes. This does NOT catch every possible ReDoS
 * (e.g. alternation-based `(a|a)+`); the primary defense is that schema
 * autoload is opt-in (validateAgainstSchema defaults to false). A truly hard
 * guarantee would require running validation in a Worker with a timeout — out
 * of scope for this minimal pre-submission fix, since a synchronous regex
 * cannot be aborted on the main thread.
 */
const QUANT = "(?:[+*]|\\{\\d*,?\\d*\\})";
const UNSAFE_PATTERN = new RegExp(`\\([^)]*${QUANT}[^)]*\\)\\s*${QUANT}`);

function collectPatterns(node: unknown, out: string[]): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectPatterns(item, out);
    return;
  }
  for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
    if (key === "pattern" && typeof val === "string") out.push(val);
    if (
      key === "patternProperties" &&
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val)
    ) {
      for (const patternKey of Object.keys(val as object)) out.push(patternKey);
    }
    collectPatterns(val, out);
  }
}

export function compileSchema(text: string): SchemaCompileResult {
  if (text.length > MAX_SCHEMA_BYTES) {
    return { ok: false, error: "Schema is too large" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Schema is not valid JSON: ${(e as Error).message}` };
  }

  const patterns: string[] = [];
  collectPatterns(parsed, patterns);
  for (const p of patterns) {
    if (UNSAFE_PATTERN.test(p)) {
      return { ok: false, error: `Schema contains a potentially unsafe regex pattern: ${p}` };
    }
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
  _err: ErrorObject,
): JsonPath {
  if (pointer === "") return [];
  const rawSegments = pointer.split("/").slice(1).map(decodePointerSegment);
  const result: JsonPath = [];
  let cur: JsonValue = rootValue;
  for (const seg of rawSegments) {
    if (Array.isArray(cur)) {
      const idx = Number.parseInt(seg, 10);
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
