import { describe, it, expect } from "vitest";
import { History } from "../../src/core/history";

describe("History", () => {
  it("starts with no undo or redo available", () => {
    const h = new History();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it("push enables undo", () => {
    const h = new History();
    h.push({ value: { a: 1 }, description: "initial" });
    expect(h.canUndo()).toBe(true);
    expect(h.canRedo()).toBe(false);
  });

  it("undo returns the pushed state and enables redo", () => {
    const h = new History();
    h.push({ value: { a: 1 }, description: "initial" });
    const result = h.undo({ value: { a: 2 }, description: "current" });
    expect(result?.value).toEqual({ a: 1 });
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(true);
  });

  it("redo returns the redone state and restores undo", () => {
    const h = new History();
    h.push({ value: { a: 1 }, description: "v1" });
    h.undo({ value: { a: 2 }, description: "v2" });
    const result = h.redo({ value: { a: 1 }, description: "v1-now" });
    expect(result?.value).toEqual({ a: 2 });
    expect(h.canRedo()).toBe(false);
    expect(h.canUndo()).toBe(true);
  });

  it("push after undo clears the redo stack", () => {
    const h = new History();
    h.push({ value: { a: 1 }, description: "v1" });
    h.undo({ value: { a: 2 }, description: "v2" });
    expect(h.canRedo()).toBe(true);
    h.push({ value: { a: 3 }, description: "v3" });
    expect(h.canRedo()).toBe(false);
  });

  it("undo returns null when stack empty", () => {
    const h = new History();
    expect(h.undo({ value: 1, description: "x" })).toBeNull();
  });

  it("redo returns null when stack empty", () => {
    const h = new History();
    expect(h.redo({ value: 1, description: "x" })).toBeNull();
  });

  it("clear empties both stacks", () => {
    const h = new History();
    h.push({ value: 1, description: "a" });
    h.undo({ value: 2, description: "b" });
    h.clear();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it("trims oldest entries beyond capacity", () => {
    const h = new History(2);
    h.push({ value: 1, description: "v1" });
    h.push({ value: 2, description: "v2" });
    h.push({ value: 3, description: "v3" });
    // Undo gets v3, v2; the v1 was trimmed
    expect(h.undo({ value: 4, description: "v4" })?.value).toBe(3);
    expect(h.undo({ value: 3, description: "v3" })?.value).toBe(2);
    expect(h.undo({ value: 2, description: "v2" })).toBeNull();
  });

  it("preserves description in returned state", () => {
    const h = new History();
    h.push({ value: 1, description: "add foo" });
    const result = h.undo({ value: 2, description: "current" });
    expect(result?.description).toBe("add foo");
  });
});
