import { pathToString } from "./path";
import type { JsonPath, JsonValue } from "./types";

/** Upper bound on the "go to path" list — a multi-MB file has more paths than
 *  any picker can usefully show, and building them all would stall the UI. */
export const PATH_COLLECT_LIMIT = 5000;

/**
 * Every addressable path in `value` as a string, in document order.
 * `truncated` says whether the limit cut the list short — callers must surface
 * that rather than pretend the list is complete.
 */
export function collectPaths(
  value: JsonValue,
  limit: number = PATH_COLLECT_LIMIT,
): { paths: string[]; truncated: boolean } {
  const paths: string[] = [];
  let truncated = false;

  function walk(v: JsonValue, path: JsonPath): void {
    if (truncated) return;
    if (v === null || typeof v !== "object") return;
    const entries: [string | number, JsonValue][] = Array.isArray(v)
      ? v.map((child, i) => [i, child])
      : Object.entries(v);
    for (const [segment, child] of entries) {
      if (paths.length >= limit) {
        truncated = true;
        return;
      }
      const childPath = [...path, segment];
      paths.push(pathToString(childPath));
      walk(child, childPath);
      if (truncated) return;
    }
  }

  walk(value, []);
  return { paths, truncated };
}
