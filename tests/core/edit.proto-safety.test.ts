import { describe, expect, it } from "vitest";
import { addObjectKey, deleteAt, moveObjectKey, renameKey } from "../../src/core/edit";

// Audit 2.3 + 2.16: structural object rebuilds used `updated[k] = v` (hits the
// native __proto__ setter for an own "__proto__" key from JSON.parse → silent
// data loss on save), and the existence guards used `key in obj` (walks the
// prototype chain → refuses legitimate keys like constructor/toString/__proto__
// with a misleading "already exists"). Assertions use own-key checks + a
// serialize round-trip — NOT toEqual, which can compare a prototype __proto__.

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const roundTrips = (o: unknown, k: string) => hasOwn(JSON.parse(JSON.stringify(o)) as object, k);

describe("edit.ts — __proto__ own-key data-loss safety (2.3)", () => {
  it("deleteAt preserves a sibling own __proto__ key", () => {
    const obj = JSON.parse('{"__proto__":{"x":1},"a":1,"b":2}');
    const result = deleteAt(obj, ["a"]) as Record<string, unknown>;
    expect(hasOwn(result, "__proto__")).toBe(true);
    expect(Object.keys(result)).toEqual(["__proto__", "b"]);
    expect(roundTrips(result, "__proto__")).toBe(true);
  });

  it("renameKey preserves a sibling own __proto__ key", () => {
    const obj = JSON.parse('{"__proto__":1,"a":2}');
    const result = renameKey(obj, ["a"], "c") as Record<string, unknown>;
    expect(hasOwn(result, "__proto__")).toBe(true);
    expect(Object.keys(result)).toEqual(["__proto__", "c"]);
    expect(roundTrips(result, "__proto__")).toBe(true);
  });

  it("moveObjectKey preserves an own __proto__ key while reordering", () => {
    const obj = JSON.parse('{"__proto__":1,"a":2,"b":3}');
    const result = moveObjectKey(obj, [], "b", 0) as Record<string, unknown>;
    expect(hasOwn(result, "__proto__")).toBe(true);
    expect(Object.keys(result)).toEqual(["b", "__proto__", "a"]);
    expect(roundTrips(result, "__proto__")).toBe(true);
  });
});

describe("edit.ts — reserved key names via hasOwnProperty guard (2.16)", () => {
  it("addObjectKey can add inherited-prototype names (constructor, toString, __proto__)", () => {
    for (const key of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      const result = addObjectKey(JSON.parse('{"a":1}'), [], key, 7) as Record<string, unknown>;
      expect(hasOwn(result, key)).toBe(true);
      expect(roundTrips(result, key)).toBe(true);
    }
  });

  it("renameKey can rename to a reserved name", () => {
    const result = renameKey(JSON.parse('{"a":1}'), ["a"], "constructor") as Record<
      string,
      unknown
    >;
    expect(hasOwn(result, "constructor")).toBe(true);
    expect(Object.keys(result)).toEqual(["constructor"]);
  });

  it("addObjectKey still rejects a genuine own-key duplicate", () => {
    expect(() => addObjectKey(JSON.parse('{"a":1}'), [], "a", 2)).toThrow(/already exists/);
  });

  it("renameKey still rejects renaming onto a genuine own key", () => {
    expect(() => renameKey(JSON.parse('{"a":1,"b":2}'), ["a"], "b")).toThrow(/already exists/);
  });
});
