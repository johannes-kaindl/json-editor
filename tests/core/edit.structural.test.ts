import { describe, it, expect } from "vitest";
import { addObjectKey, addArrayItem, deleteAt, renameKey } from "../../src/core/edit";

describe("addObjectKey", () => {
  it("adds a key at root", () => {
    expect(addObjectKey({ a: 1 }, [], "b", 2)).toEqual({ a: 1, b: 2 });
  });

  it("adds a key at nested path", () => {
    expect(addObjectKey({ outer: { a: 1 } }, ["outer"], "b", 2)).toEqual({
      outer: { a: 1, b: 2 },
    });
  });

  it("throws on empty key", () => {
    expect(() => addObjectKey({ a: 1 }, [], "", 2)).toThrow("Key cannot be empty");
  });

  it("throws on duplicate key", () => {
    expect(() => addObjectKey({ a: 1 }, [], "a", 2)).toThrow('Key "a" already exists');
  });

  it("throws when parent is not an object", () => {
    expect(() => addObjectKey([1, 2], [], "x", 3)).toThrow("Parent is not an object");
  });

  it("preserves immutability", () => {
    const orig = { a: 1 };
    const result = addObjectKey(orig, [], "b", 2);
    expect(orig).toEqual({ a: 1 });
    expect(result).not.toBe(orig);
  });
});

describe("addArrayItem", () => {
  it("appends to array at root", () => {
    expect(addArrayItem([1, 2], [], 3)).toEqual([1, 2, 3]);
  });

  it("appends to nested array", () => {
    expect(addArrayItem({ arr: [1] }, ["arr"], 2)).toEqual({ arr: [1, 2] });
  });

  it("inserts at given index", () => {
    expect(addArrayItem([1, 2, 3], [], 99, 1)).toEqual([1, 99, 2, 3]);
  });

  it("throws when parent is not an array", () => {
    expect(() => addArrayItem({ a: 1 }, [], 2)).toThrow("Parent is not an array");
  });

  it("appends with null default", () => {
    expect(addArrayItem([1], [], null)).toEqual([1, null]);
  });
});

describe("deleteAt", () => {
  it("deletes an object key at root", () => {
    expect(deleteAt({ a: 1, b: 2 }, ["a"])).toEqual({ b: 2 });
  });

  it("deletes an array item at root", () => {
    expect(deleteAt([1, 2, 3], [1])).toEqual([1, 3]);
  });

  it("deletes nested key", () => {
    expect(deleteAt({ outer: { a: 1, b: 2 } }, ["outer", "a"])).toEqual({ outer: { b: 2 } });
  });

  it("throws on empty path (cannot delete root)", () => {
    expect(() => deleteAt({ a: 1 }, [])).toThrow("Cannot delete root");
  });

  it("is no-op for non-existent object key", () => {
    expect(deleteAt({ a: 1 }, ["missing"])).toEqual({ a: 1 });
  });

  it("preserves immutability", () => {
    const orig = { a: 1, b: 2 };
    const result = deleteAt(orig, ["a"]);
    expect(orig).toEqual({ a: 1, b: 2 });
    expect(result).not.toBe(orig);
  });
});

describe("renameKey", () => {
  it("renames an object key, preserving insertion order", () => {
    const r = renameKey({ a: 1, b: 2, c: 3 }, ["b"], "renamed");
    expect(Object.keys(r as object)).toEqual(["a", "renamed", "c"]);
    expect((r as { renamed: number }).renamed).toBe(2);
  });

  it("renames nested key", () => {
    expect(renameKey({ outer: { a: 1 } }, ["outer", "a"], "b")).toEqual({ outer: { b: 1 } });
  });

  it("returns same value when newKey === oldKey", () => {
    expect(renameKey({ a: 1 }, ["a"], "a")).toEqual({ a: 1 });
  });

  it("throws on empty newKey", () => {
    expect(() => renameKey({ a: 1 }, ["a"], "")).toThrow("Key cannot be empty");
  });

  it("throws on duplicate newKey", () => {
    expect(() => renameKey({ a: 1, b: 2 }, ["a"], "b")).toThrow('Key "b" already exists');
  });

  it("throws when renaming an array index", () => {
    expect(() => renameKey([1, 2], [0], "x")).toThrow("Cannot rename an array index");
  });

  it("throws on root path", () => {
    expect(() => renameKey({ a: 1 }, [], "x")).toThrow("Cannot rename root");
  });
});
