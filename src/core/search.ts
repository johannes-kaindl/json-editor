import type { JsonValue, SearchOptions, SearchResult } from "./types";
import { pathToString } from "./path";

function primitiveMatches(v: JsonValue, lowerQ: string): boolean {
  if (v === null) return "null".includes(lowerQ);
  if (typeof v === "boolean") return String(v).includes(lowerQ);
  if (typeof v === "number") return String(v).toLowerCase().includes(lowerQ);
  if (typeof v === "string") return v.toLowerCase().includes(lowerQ);
  return false;
}

export function findMatches(
  value: JsonValue,
  query: string,
  opts?: SearchOptions
): SearchResult {
  const result: SearchResult = {
    matches: new Set(),
    onPath: new Set(),
    counts: { keys: 0, values: 0 },
  };
  if (query.trim() === "") return result;

  const lowerQ = query.toLowerCase();
  const matchKeys = opts?.matchKeys ?? true;
  const matchValues = opts?.matchValues ?? true;

  function markAncestors(path: (string | number)[]): void {
    for (let i = 0; i < path.length; i++) {
      result.onPath.add(pathToString(path.slice(0, i)));
    }
  }

  function walk(v: JsonValue, path: (string | number)[]): void {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const [key, child] of Object.entries(v)) {
        const childPath = [...path, key];
        if (matchKeys && key.toLowerCase().includes(lowerQ)) {
          result.matches.add(pathToString(childPath));
          result.counts.keys++;
          markAncestors(childPath);
        }
        walk(child, childPath);
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((child, i) => walk(child, [...path, i]));
      return;
    }
    if (matchValues && primitiveMatches(v, lowerQ)) {
      result.matches.add(pathToString(path));
      result.counts.values++;
      markAncestors(path);
    }
  }

  walk(value, []);
  return result;
}
