import { type OutputUnit, type Schema, Validator } from "@cfworker/json-schema";
import { DRAFT_07_META_SCHEMA } from "./draft07-meta-schema";
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
  | { ok: false; error: string; errorCode?: SchemaErrorCode; errorArgs?: readonly string[] };

/** The compiler's own findings, so the UI can translate them. A text the validator library produced has no code and stays as it is. */
export type SchemaErrorCode =
  | "schemaTooLarge"
  | "schemaNotJson"
  | "schemaUnsafePattern"
  | "schemaNotDraft07";

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
      for (const patternKey of Object.keys(val)) out.push(patternKey);
    }
    collectPatterns(val, out);
  }
}

/**
 * Validates candidate schemas against the draft-07 meta-schema. @cfworker is a
 * lenient interpreter that — unlike ajv — does not throw on a structurally
 * invalid schema, so we meta-validate to keep the "malformed schema -> error"
 * contract. Reused across calls (stateless; eval-free).
 */
const META_VALIDATOR = new Validator(DRAFT_07_META_SCHEMA, "7", false);

export function compileSchema(text: string): SchemaCompileResult {
  if (text.length > MAX_SCHEMA_BYTES) {
    return { ok: false, error: "Schema is too large", errorCode: "schemaTooLarge" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const detail = (e as Error).message;
    return {
      ok: false,
      error: `Schema is not valid JSON: ${detail}`,
      errorCode: "schemaNotJson",
      errorArgs: [detail],
    };
  }

  const patterns: string[] = [];
  collectPatterns(parsed, patterns);
  for (const p of patterns) {
    if (UNSAFE_PATTERN.test(p)) {
      return {
        ok: false,
        error: `Schema contains a potentially unsafe regex pattern: ${p}`,
        errorCode: "schemaUnsafePattern",
        errorArgs: [p],
      };
    }
  }

  if (!META_VALIDATOR.validate(parsed).valid) {
    return {
      ok: false,
      error: "Schema is not a valid JSON Schema (draft-07)",
      errorCode: "schemaNotDraft07",
    };
  }

  let validator: Validator;
  try {
    validator = new Validator(parsed as Schema | boolean, "7", false);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const validate = (value: JsonValue): PathError[] => {
    const result = validator.validate(value);
    if (result.valid) return [];
    return reduceErrors(result.errors).map((e) => ({
      path: pointerToJsonPath(stripHash(e.instanceLocation), value),
      message: e.error,
    }));
  };

  return { ok: true, schema: { validate } };
}

/** @cfworker prefixes instanceLocation with `#` (`#` = root, `#/foo/bar`). */
function stripHash(loc: string): string {
  return loc.startsWith("#") ? loc.slice(1) : loc;
}

/**
 * Pure structural applicator keywords: their error is ALWAYS just a wrapper that
 * @cfworker emits at every enclosing level around a more specific child error
 * (the subschema they apply reports its own failure). Dropping them collapses
 * cfworker's cascading errors down to ajv-like per-instance granularity. Note
 * what is intentionally NOT here: assertion keywords (type/required/minimum/…)
 * and the meaningful applicators `not`/`anyOf`/`oneOf`/`contains` — those can be
 * the only error and carry real meaning, so they must survive.
 */
const WRAPPER_KEYWORDS = new Set([
  "properties",
  "additionalProperties",
  "patternProperties",
  "items",
  "additionalItems",
  "prefixItems",
  "allOf",
  "$ref",
]);

/**
 * Reduce @cfworker's verbose, cascading error set to the meaningful failures,
 * matching ajv's old per-instance granularity:
 *  1. drop pure structural wrapper errors (properties/items/$ref/…);
 *  2. drop a `false` boolean-schema error (additionalProperties:false etc.) when
 *     a real error already sits at the same instance location — but keep it when
 *     it is the only signal there (a genuinely disallowed extra property);
 *  3. de-duplicate identical (location + message) errors that overlapping
 *     allOf/anyOf branches would otherwise report twice.
 */
function reduceErrors(errors: OutputUnit[]): OutputUnit[] {
  const meaningful = errors.filter((e) => !WRAPPER_KEYWORDS.has(e.keyword));
  const deNoised = meaningful.filter(
    (e) =>
      e.keyword !== "false" ||
      !meaningful.some(
        (o) => o !== e && o.keyword !== "false" && o.instanceLocation === e.instanceLocation,
      ),
  );
  const seen = new Set<string>();
  const out: OutputUnit[] = [];
  for (const e of deNoised) {
    const key = `${stripHash(e.instanceLocation)}\u0000${e.error}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

/**
 * Convert a bare JSON-Pointer instance location into our JsonPath segment array.
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
function pointerToJsonPath(pointer: string, rootValue: JsonValue): JsonPath {
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
