import { describe, expect, it } from "vitest";
import { type JsonType, changeType } from "../../src/core/edit";

describe("changeType", () => {
  describe("primitive → primitive", () => {
    it("string → number returns 0", () => {
      expect(changeType("hello", [], "number")).toBe(0);
    });

    it("string → boolean returns false", () => {
      expect(changeType("hello", [], "boolean")).toBe(false);
    });

    it("string → null returns null", () => {
      expect(changeType("hello", [], "null")).toBe(null);
    });

    it("number → string returns empty string", () => {
      expect(changeType(42, [], "string")).toBe("");
    });

    it("number → boolean returns false", () => {
      expect(changeType(42, [], "boolean")).toBe(false);
    });

    it("boolean → number returns 0", () => {
      expect(changeType(true, [], "number")).toBe(0);
    });

    it("null → string returns empty string", () => {
      expect(changeType(null, [], "string")).toBe("");
    });

    it("null → object returns empty object", () => {
      expect(changeType(null, [], "object")).toEqual({});
    });
  });

  describe("primitive → container", () => {
    it("string → object returns {}", () => {
      expect(changeType("hello", [], "object")).toEqual({});
    });

    it("number → array returns []", () => {
      expect(changeType(42, [], "array")).toEqual([]);
    });
  });

  describe("container → container", () => {
    it("object → array discards contents", () => {
      expect(changeType({ a: 1, b: 2 }, [], "array")).toEqual([]);
    });

    it("array → object discards contents", () => {
      expect(changeType([1, 2, 3], [], "object")).toEqual({});
    });
  });

  describe("container → primitive", () => {
    it("object → string returns empty string", () => {
      expect(changeType({ a: 1 }, [], "string")).toBe("");
    });

    it("array → null returns null", () => {
      expect(changeType([1, 2], [], "null")).toBe(null);
    });
  });

  describe("no-op when newType equals current type", () => {
    it("string → string returns same reference", () => {
      const orig = "hello";
      expect(changeType(orig, [], "string")).toBe(orig);
    });

    it("object → object returns same reference", () => {
      const orig = { a: 1 };
      expect(changeType(orig, [], "object")).toBe(orig);
    });

    it("array → array returns same reference", () => {
      const orig = [1, 2, 3];
      expect(changeType(orig, [], "array")).toBe(orig);
    });

    it("null → null returns same reference", () => {
      expect(changeType(null, [], "null")).toBe(null);
    });
  });

  describe("nested path", () => {
    it("changes nested primitive in object", () => {
      expect(changeType({ a: 42 }, ["a"], "string")).toEqual({ a: "" });
    });

    it("changes nested array item type", () => {
      expect(changeType([1, "two", 3], [1], "number")).toEqual([1, 0, 3]);
    });

    it("changes deeply nested value", () => {
      expect(changeType({ outer: { inner: true } }, ["outer", "inner"], "string")).toEqual({
        outer: { inner: "" },
      });
    });

    it("preserves siblings", () => {
      expect(changeType({ a: 1, b: 2, c: 3 }, ["b"], "string")).toEqual({
        a: 1,
        b: "",
        c: 3,
      });
    });
  });

  describe("immutability", () => {
    it("does not mutate the original object", () => {
      const orig = { a: 1, b: 2 };
      changeType(orig, ["a"], "string");
      expect(orig).toEqual({ a: 1, b: 2 });
    });

    it("returns a new object reference for nested change", () => {
      const orig = { a: 1 };
      const result = changeType(orig, ["a"], "string");
      expect(result).not.toBe(orig);
    });
  });

  describe("all types covered as a matrix", () => {
    const types: JsonType[] = ["string", "number", "boolean", "null", "object", "array"];
    const samples: Record<JsonType, unknown> = {
      string: "x",
      number: 1,
      boolean: true,
      null: null,
      object: { k: 1 },
      array: [1],
    };
    const expected: Record<JsonType, unknown> = {
      string: "",
      number: 0,
      boolean: false,
      null: null,
      object: {},
      array: [],
    };

    for (const from of types) {
      for (const to of types) {
        if (from === to) continue;
        it(`${from} → ${to} returns the default for ${to}`, () => {
          expect(changeType(samples[from] as never, [], to)).toEqual(expected[to]);
        });
      }
    }
  });
});
