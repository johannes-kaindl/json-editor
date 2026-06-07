import { describe, expect, it } from "vitest";
import { parse } from "../../src/core/parse";
import { serialize } from "../../src/core/serialize";

describe("serialize", () => {
  it("serializes primitives with no indent (indent: 0)", () => {
    expect(serialize(null, { indent: 0 })).toBe("null");
    expect(serialize(true, { indent: 0 })).toBe("true");
    expect(serialize(42, { indent: 0 })).toBe("42");
    expect(serialize("hello", { indent: 0 })).toBe('"hello"');
  });

  it("serializes objects with 2-space indent", () => {
    const result = serialize({ a: 1, b: true }, { indent: 2 });
    expect(result).toBe('{\n  "a": 1,\n  "b": true\n}');
  });

  it("serializes objects with 4-space indent", () => {
    const result = serialize({ a: 1 }, { indent: 4 });
    expect(result).toBe('{\n    "a": 1\n}');
  });

  it("serializes objects with tab indent", () => {
    const result = serialize({ a: 1 }, { indent: "\t" });
    expect(result).toBe('{\n\t"a": 1\n}');
  });

  it("serializes nested structures", () => {
    const value = { users: [{ name: "jay" }] };
    const result = serialize(value, { indent: 2 });
    expect(result).toBe('{\n  "users": [\n    {\n      "name": "jay"\n    }\n  ]\n}');
  });

  it("round-trips: parse then serialize yields equivalent JSON", () => {
    const original = '{"a":1,"b":[true,null,"x"]}';
    const parsed = parse(original);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const back = serialize(parsed.value, { indent: 0 });
      expect(JSON.parse(back)).toEqual(JSON.parse(original));
    }
  });
});
