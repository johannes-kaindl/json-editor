import type { JsonPath, JsonValue } from "./types";

/** Own-property check that does not walk the prototype chain (audit 2.16). */
function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Rebuild a plain object from [key, value] entries WITHOUT triggering the
 * native `__proto__` setter (audit 2.3). Object.fromEntries uses
 * [[DefineOwnProperty]], so an own "__proto__" entry stays an own data
 * property instead of becoming the prototype (which JSON.stringify would drop).
 */
function objectFromEntries(entries: Array<[string, JsonValue]>): { [k: string]: JsonValue } {
  return Object.fromEntries(entries) as { [k: string]: JsonValue };
}

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

function getAt(value: JsonValue, path: JsonPath): JsonValue {
  let cur: JsonValue = value;
  for (const seg of path) {
    if (Array.isArray(cur) && typeof seg === "number") {
      cur = cur[seg];
    } else if (cur !== null && typeof cur === "object" && typeof seg === "string") {
      cur = (cur as { [k: string]: JsonValue })[seg];
    } else {
      throw new Error(`Cannot descend into ${typeof cur} at path segment ${String(seg)}`);
    }
  }
  return cur;
}

export function addObjectKey(
  value: JsonValue,
  parentPath: JsonPath,
  key: string,
  newVal: JsonValue,
): JsonValue {
  if (key === "") throw new Error("Key cannot be empty");
  const parent = getAt(value, parentPath);
  if (parent === null || typeof parent !== "object" || Array.isArray(parent)) {
    throw new Error("Parent is not an object");
  }
  const obj = parent as { [k: string]: JsonValue };
  if (hasOwn(obj, key)) throw new Error(`Key "${key}" already exists`);
  const updated: { [k: string]: JsonValue } = { ...obj, [key]: newVal };
  if (parentPath.length === 0) return updated;
  return editValue(value, parentPath, updated);
}

export function addArrayItem(
  value: JsonValue,
  parentPath: JsonPath,
  newVal: JsonValue,
  atIndex?: number,
): JsonValue {
  const parent = getAt(value, parentPath);
  if (!Array.isArray(parent)) {
    throw new Error("Parent is not an array");
  }
  const updated = parent.slice();
  if (atIndex === undefined || atIndex >= updated.length) {
    updated.push(newVal);
  } else {
    updated.splice(Math.max(0, atIndex), 0, newVal);
  }
  if (parentPath.length === 0) return updated;
  return editValue(value, parentPath, updated);
}

export function deleteAt(value: JsonValue, path: JsonPath): JsonValue {
  if (path.length === 0) {
    throw new Error("Cannot delete root");
  }
  const parentPath = path.slice(0, -1);
  const lastSeg = path[path.length - 1];
  const parent = getAt(value, parentPath);

  if (Array.isArray(parent)) {
    if (typeof lastSeg !== "number") {
      throw new Error(`Expected numeric index for array, got ${typeof lastSeg}`);
    }
    const updated = parent.slice();
    updated.splice(lastSeg, 1);
    if (parentPath.length === 0) return updated;
    return editValue(value, parentPath, updated);
  }

  if (parent !== null && typeof parent === "object") {
    if (typeof lastSeg !== "string") {
      throw new Error(`Expected string key for object, got ${typeof lastSeg}`);
    }
    const obj = parent as { [k: string]: JsonValue };
    if (!hasOwn(obj, lastSeg)) return value;
    const updated = objectFromEntries(Object.entries(obj).filter(([k]) => k !== lastSeg));
    if (parentPath.length === 0) return updated;
    return editValue(value, parentPath, updated);
  }

  throw new Error(`Cannot delete from ${typeof parent}`);
}

export type JsonType = "string" | "number" | "boolean" | "null" | "object" | "array";

function defaultForType(type: JsonType): JsonValue {
  switch (type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    case "object":
      return {};
    case "array":
      return [];
  }
}

function typeOf(value: JsonValue): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    default:
      throw new Error(`Unsupported value type: ${typeof value}`);
  }
}

export function changeType(value: JsonValue, path: JsonPath, newType: JsonType): JsonValue {
  const current = getAt(value, path);
  if (typeOf(current) === newType) return value;
  const replacement = defaultForType(newType);
  if (path.length === 0) return replacement;
  return editValue(value, path, replacement);
}

export function moveArrayItem(
  value: JsonValue,
  parentPath: JsonPath,
  fromIdx: number,
  toIdx: number,
): JsonValue {
  const parent = getAt(value, parentPath);
  if (!Array.isArray(parent)) {
    throw new Error("Parent is not an array");
  }
  if (fromIdx < 0 || fromIdx >= parent.length) {
    throw new Error("Index out of bounds");
  }
  const clampedTo = Math.max(0, Math.min(toIdx, parent.length - 1));
  if (clampedTo === fromIdx) return value;
  const updated = parent.slice();
  const [item] = updated.splice(fromIdx, 1);
  updated.splice(clampedTo, 0, item);
  if (parentPath.length === 0) return updated;
  return editValue(value, parentPath, updated);
}

export function moveObjectKey(
  value: JsonValue,
  parentPath: JsonPath,
  key: string,
  toPos: number,
): JsonValue {
  const parent = getAt(value, parentPath);
  if (parent === null || typeof parent !== "object" || Array.isArray(parent)) {
    throw new Error("Parent is not an object");
  }
  const obj = parent as { [k: string]: JsonValue };
  const keys = Object.keys(obj);
  const currentPos = keys.indexOf(key);
  if (currentPos === -1) throw new Error("Key not found");
  const clamped = Math.max(0, Math.min(toPos, keys.length - 1));
  if (clamped === currentPos) return value;
  const reordered = keys.slice();
  reordered.splice(currentPos, 1);
  reordered.splice(clamped, 0, key);
  const updated = objectFromEntries(reordered.map((k) => [k, obj[k]]));
  if (parentPath.length === 0) return updated;
  return editValue(value, parentPath, updated);
}

/**
 * Compute the array splice-insert index after the dragged item has been
 * removed from its original position. The drop position is either "before"
 * or "after" the target row (top-half / bottom-half heuristic). Returning
 * `fromIdx` itself signals a no-op (dropped onto self).
 */
export function computeInsertionIndex(
  fromIdx: number,
  toIdx: number,
  dropPosition: "before" | "after",
): number {
  if (fromIdx === toIdx) return fromIdx;
  // Step 1: target index after removal of the dragged item.
  const adjustedTarget = toIdx > fromIdx ? toIdx - 1 : toIdx;
  // Step 2: insert before or after that target.
  return dropPosition === "after" ? adjustedTarget + 1 : adjustedTarget;
}

export function renameKey(value: JsonValue, path: JsonPath, newKey: string): JsonValue {
  if (path.length === 0) throw new Error("Cannot rename root");
  if (newKey === "") throw new Error("Key cannot be empty");
  const parentPath = path.slice(0, -1);
  const oldKey = path[path.length - 1];
  if (typeof oldKey !== "string") {
    throw new Error("Cannot rename an array index — use moveArrayItem (not in 1.0.0)");
  }
  if (oldKey === newKey) return value;

  const parent = getAt(value, parentPath);
  if (parent === null || typeof parent !== "object" || Array.isArray(parent)) {
    throw new Error("Parent is not an object");
  }
  const obj = parent as { [k: string]: JsonValue };
  if (!hasOwn(obj, oldKey)) return value;
  if (hasOwn(obj, newKey)) throw new Error(`Key "${newKey}" already exists`);

  // Preserve insertion order: rebuild object replacing oldKey with newKey at
  // the same position.
  const updated = objectFromEntries(
    Object.entries(obj).map(([k, v]) => [k === oldKey ? newKey : k, v]),
  );
  if (parentPath.length === 0) return updated;
  return editValue(value, parentPath, updated);
}
