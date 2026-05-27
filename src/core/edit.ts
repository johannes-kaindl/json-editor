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
  newVal: JsonValue
): JsonValue {
  if (key === "") throw new Error("Key cannot be empty");
  const parent = getAt(value, parentPath);
  if (parent === null || typeof parent !== "object" || Array.isArray(parent)) {
    throw new Error("Parent is not an object");
  }
  const obj = parent as { [k: string]: JsonValue };
  if (key in obj) throw new Error(`Key "${key}" already exists`);
  const updated: { [k: string]: JsonValue } = { ...obj, [key]: newVal };
  if (parentPath.length === 0) return updated;
  return editValue(value, parentPath, updated);
}

export function addArrayItem(
  value: JsonValue,
  parentPath: JsonPath,
  newVal: JsonValue,
  atIndex?: number
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
    if (!(lastSeg in obj)) return value;
    const updated: { [k: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k !== lastSeg) updated[k] = v;
    }
    if (parentPath.length === 0) return updated;
    return editValue(value, parentPath, updated);
  }

  throw new Error(`Cannot delete from ${typeof parent}`);
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
  if (!(oldKey in obj)) return value;
  if (newKey in obj) throw new Error(`Key "${newKey}" already exists`);

  // Preserve insertion order: rebuild object replacing oldKey with newKey at
  // the same position.
  const updated: { [k: string]: JsonValue } = {};
  for (const [k, v] of Object.entries(obj)) {
    updated[k === oldKey ? newKey : k] = v;
  }
  if (parentPath.length === 0) return updated;
  return editValue(value, parentPath, updated);
}
