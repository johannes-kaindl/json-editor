import { describe, it, expect } from "vitest";
import { History } from "../../src/core/history";

describe("History<T>", () => {
  it("starts with no undo or redo available", () => {
    const h = new History<string>();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it("push enables undo", () => {
    const h = new History<string>();
    h.push("v1");
    expect(h.canUndo()).toBe(true);
    expect(h.canRedo()).toBe(false);
  });

  it("undo returns the pushed state and enables redo", () => {
    const h = new History<string>();
    h.push("v1");
    const result = h.undo("v2");
    expect(result).toBe("v1");
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(true);
  });

  it("redo returns the redone state and restores undo", () => {
    const h = new History<string>();
    h.push("v1");
    h.undo("v2");
    const result = h.redo("v1-now");
    expect(result).toBe("v2");
    expect(h.canRedo()).toBe(false);
    expect(h.canUndo()).toBe(true);
  });

  it("push after undo clears the redo stack", () => {
    const h = new History<string>();
    h.push("v1");
    h.undo("v2");
    expect(h.canRedo()).toBe(true);
    h.push("v3");
    expect(h.canRedo()).toBe(false);
  });

  it("undo returns null when stack empty", () => {
    const h = new History<string>();
    expect(h.undo("x")).toBeNull();
  });

  it("redo returns null when stack empty", () => {
    const h = new History<string>();
    expect(h.redo("x")).toBeNull();
  });

  it("clear empties both stacks", () => {
    const h = new History<string>();
    h.push("a");
    h.undo("b");
    h.clear();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it("trims oldest entries beyond capacity", () => {
    const h = new History<number>(2);
    h.push(1);
    h.push(2);
    h.push(3);
    expect(h.undo(4)).toBe(3);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBeNull();
  });

  it("works with arbitrary T (object snapshots)", () => {
    interface Snap {
      text: string;
      cursor: number;
    }
    const h = new History<Snap>();
    h.push({ text: "hello", cursor: 5 });
    const result = h.undo({ text: "world", cursor: 0 });
    expect(result?.text).toBe("hello");
    expect(result?.cursor).toBe(5);
  });
});
