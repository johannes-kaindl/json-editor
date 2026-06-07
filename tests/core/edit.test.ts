import { describe, expect, it } from "vitest";
import { editValue } from "../../src/core/edit";

describe("editValue", () => {
  it("edits a top-level scalar by empty path", () => {
    expect(editValue("old", [], "new")).toBe("new");
  });

  it("edits a value in an object", () => {
    const original = { a: 1, b: 2 };
    const result = editValue(original, ["a"], 99);
    expect(result).toEqual({ a: 99, b: 2 });
  });

  it("does not mutate the original object", () => {
    const original = { a: 1, b: 2 };
    editValue(original, ["a"], 99);
    expect(original).toEqual({ a: 1, b: 2 });
  });

  it("edits a value in an array by numeric index", () => {
    const original = [1, 2, 3];
    const result = editValue(original, [1], 99);
    expect(result).toEqual([1, 99, 3]);
  });

  it("does not mutate the original array", () => {
    const original = [1, 2, 3];
    editValue(original, [1], 99);
    expect(original).toEqual([1, 2, 3]);
  });

  it("edits a nested value", () => {
    const original = { users: [{ name: "jay" }, { name: "alex" }] };
    const result = editValue(original, ["users", 1, "name"], "sam");
    expect(result).toEqual({ users: [{ name: "jay" }, { name: "sam" }] });
  });

  it("does not mutate the original nested structure", () => {
    const original = { users: [{ name: "jay" }] };
    const result = editValue(original, ["users", 0, "name"], "sam");
    expect(original.users[0].name).toBe("jay");
    expect(result).not.toBe(original);
  });

  it("throws on invalid path (key on non-object)", () => {
    expect(() => editValue(42, ["a"], 1)).toThrow();
  });

  it("throws on invalid path (index on non-array)", () => {
    expect(() => editValue({ a: 1 }, [0], 1)).toThrow();
  });
});
