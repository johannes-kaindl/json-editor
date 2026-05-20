import type { JsonValue, JsonPath } from "./types";

export function editValue(value: JsonValue, path: JsonPath, newVal: JsonValue): JsonValue {
  if (path.length === 0) {
    return newVal;
  }
  const [head, ...rest] = path;

  if (Array.isArray(value)) {
    if (typeof head !== "number") {
      throw new Error(`Expected numeric index at array, got ${typeof head}`);
    }
    const copy = value.slice();
    copy[head] = editValue(value[head], rest, newVal);
    return copy;
  }

  if (value !== null && typeof value === "object") {
    if (typeof head !== "string") {
      throw new Error(`Expected string key at object, got ${typeof head}`);
    }
    const obj = value as { [k: string]: JsonValue };
    return { ...obj, [head]: editValue(obj[head], rest, newVal) };
  }

  throw new Error(`Cannot descend into ${typeof value} at path segment ${String(head)}`);
}
