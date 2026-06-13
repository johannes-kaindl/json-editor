import { describe, expect, it } from "vitest";
import { hasNumberRoundtripLoss } from "../../src/core/roundtrip";

// Blocker 1.4: parse -> serialize silently mutates number literals that JSON
// (IEEE-754 / JSON.stringify) cannot represent faithfully. Detect this on the
// ORIGINAL text so the view can warn before a tree edit rewrites untouched
// numbers. Compares number TOKENS only — whitespace/indent is never loss, and
// numeric-looking string contents must never trigger.

describe("hasNumberRoundtripLoss", () => {
  it("flags integers beyond 2^53 that lose precision", () => {
    expect(hasNumberRoundtripLoss('{"id":9007199254740993}')).toBe(true);
  });

  it("flags normalized number formats (1.0 -> 1)", () => {
    expect(hasNumberRoundtripLoss('{"x":1.0}')).toBe(true);
  });

  it("flags exponent normalization (1e3 -> 1000)", () => {
    expect(hasNumberRoundtripLoss('{"x":1e3}')).toBe(true);
  });

  it("flags a lossy number nested in an array", () => {
    expect(hasNumberRoundtripLoss('{"ids":[1,2,12345678901234567890]}')).toBe(true);
  });

  it("does NOT flag numbers that survive the roundtrip", () => {
    expect(hasNumberRoundtripLoss('{"a":1,"b":[true,null,"x"],"c":3.14,"d":-42,"e":0}')).toBe(
      false,
    );
  });

  it("does NOT flag numeric-looking string content", () => {
    expect(hasNumberRoundtripLoss('{"a":"1.0","b":"9007199254740993","c":"1e3"}')).toBe(false);
  });

  it("does NOT flag escaped quotes inside strings preceding numbers", () => {
    expect(hasNumberRoundtripLoss('{"a":"say \\"1.0\\"","b":2}')).toBe(false);
  });

  it("does NOT flag the same object re-indented (whitespace is not loss)", () => {
    expect(hasNumberRoundtripLoss('{\n  "a": 1,\n  "b": 3.14\n}')).toBe(false);
  });

  it("returns false for a plain top-level safe number", () => {
    expect(hasNumberRoundtripLoss("8080")).toBe(false);
  });

  it("flags a plain top-level lossy number", () => {
    expect(hasNumberRoundtripLoss("9007199254740993")).toBe(true);
  });
});
