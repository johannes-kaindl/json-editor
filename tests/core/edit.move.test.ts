import { describe, it, expect } from "vitest";
import { moveArrayItem, moveObjectKey, computeInsertionIndex } from "../../src/core/edit";

describe("moveArrayItem", () => {
  it("moves item forward within array at root", () => {
    expect(moveArrayItem([1, 2, 3, 4], [], 0, 2)).toEqual([2, 3, 1, 4]);
  });

  it("moves item backward within array at root", () => {
    expect(moveArrayItem([1, 2, 3, 4], [], 3, 1)).toEqual([1, 4, 2, 3]);
  });

  it("moves nested array item", () => {
    expect(moveArrayItem({ arr: [10, 20, 30] }, ["arr"], 0, 2)).toEqual({
      arr: [20, 30, 10],
    });
  });

  it("is no-op when fromIdx === toIdx", () => {
    const orig = [1, 2, 3];
    expect(moveArrayItem(orig, [], 1, 1)).toBe(orig);
  });

  it("clamps toIdx to last valid position", () => {
    expect(moveArrayItem([1, 2, 3], [], 0, 99)).toEqual([2, 3, 1]);
  });

  it("clamps toIdx to 0 for negative values", () => {
    expect(moveArrayItem([1, 2, 3], [], 2, -5)).toEqual([3, 1, 2]);
  });

  it("throws on out-of-bounds fromIdx", () => {
    expect(() => moveArrayItem([1, 2, 3], [], 5, 0)).toThrow("Index out of bounds");
  });

  it("throws when parent is not an array", () => {
    expect(() => moveArrayItem({ a: 1 }, [], 0, 1)).toThrow("Parent is not an array");
  });

  it("preserves immutability", () => {
    const orig = [1, 2, 3];
    const result = moveArrayItem(orig, [], 0, 2);
    expect(orig).toEqual([1, 2, 3]);
    expect(result).not.toBe(orig);
  });
});

describe("moveObjectKey", () => {
  it("moves key to end", () => {
    const r = moveObjectKey({ a: 1, b: 2, c: 3 }, [], "a", 2);
    expect(Object.keys(r as object)).toEqual(["b", "c", "a"]);
  });

  it("moves key to front", () => {
    const r = moveObjectKey({ a: 1, b: 2, c: 3 }, [], "c", 0);
    expect(Object.keys(r as object)).toEqual(["c", "a", "b"]);
  });

  it("moves key into middle", () => {
    const r = moveObjectKey({ a: 1, b: 2, c: 3, d: 4 }, [], "a", 2);
    expect(Object.keys(r as object)).toEqual(["b", "c", "a", "d"]);
  });

  it("works at nested path", () => {
    const r = moveObjectKey({ outer: { a: 1, b: 2 } }, ["outer"], "a", 1);
    expect(Object.keys((r as { outer: object }).outer)).toEqual(["b", "a"]);
  });

  it("is no-op when key is already at requested position", () => {
    const orig = { a: 1, b: 2 };
    expect(moveObjectKey(orig, [], "a", 0)).toBe(orig);
  });

  it("clamps toPos beyond last index", () => {
    const r = moveObjectKey({ a: 1, b: 2 }, [], "a", 99);
    expect(Object.keys(r as object)).toEqual(["b", "a"]);
  });

  it("clamps negative toPos to 0", () => {
    const r = moveObjectKey({ a: 1, b: 2 }, [], "b", -5);
    expect(Object.keys(r as object)).toEqual(["b", "a"]);
  });

  it("throws when key not found", () => {
    expect(() => moveObjectKey({ a: 1 }, [], "missing", 0)).toThrow("Key not found");
  });

  it("throws when parent is not an object", () => {
    expect(() => moveObjectKey([1, 2], [], "a", 0)).toThrow("Parent is not an object");
  });

  it("preserves immutability", () => {
    const orig = { a: 1, b: 2 };
    const result = moveObjectKey(orig, [], "a", 1);
    expect(orig).toEqual({ a: 1, b: 2 });
    expect(result).not.toBe(orig);
  });

  it("preserves values when reordering", () => {
    const r = moveObjectKey({ a: 1, b: 2, c: 3 }, [], "a", 2);
    expect(r).toEqual({ b: 2, c: 3, a: 1 });
  });
});

describe("computeInsertionIndex", () => {
  it("dropping before later target removes-then-inserts (net -1)", () => {
    // Items: [A, B, C, D], drag A (0), drop "before C" (target idx 2)
    // After removal of A: [B, C, D], insert at position 1 → [B, A, C, D]
    expect(computeInsertionIndex(0, 2, "before")).toBe(1);
  });

  it("dropping after later target inserts after removal", () => {
    // Drag A (0), drop "after C" (target 2)
    // After removal: [B, C, D], insert at position 2 → [B, C, A, D]
    expect(computeInsertionIndex(0, 2, "after")).toBe(2);
  });

  it("dropping before earlier target keeps target idx", () => {
    // Drag D (3), drop "before B" (target 1) → [A, D, B, C]
    expect(computeInsertionIndex(3, 1, "before")).toBe(1);
  });

  it("dropping after earlier target = target+1", () => {
    // Drag D (3), drop "after B" (target 1) → [A, B, D, C]
    expect(computeInsertionIndex(3, 1, "after")).toBe(2);
  });

  it("dropping onto self returns same idx (no-op signal)", () => {
    expect(computeInsertionIndex(2, 2, "before")).toBe(2);
    expect(computeInsertionIndex(2, 2, "after")).toBe(2);
  });
});
