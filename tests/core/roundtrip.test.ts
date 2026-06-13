import { describe, expect, it } from "vitest";
import { hasNumberRoundtripLoss } from "../../src/core/roundtrip";

// Blocker 1.4 (+ review fix): detect when parsing JSON and re-serializing it
// would change a number's VALUE — integers beyond 2^53 (typical 64-bit IDs)
// lose precision, and overflowing literals collapse to Infinity. Purely
// cosmetic, value-identical reformatting (1.0 -> 1, 1e3 -> 1000, 2.50 -> 2.5)
// is NOT loss and must not trigger, since any tree edit already reformats the
// whole document harmlessly. Compares number TOKENS only (skips string
// contents, ignores whitespace).

describe("hasNumberRoundtripLoss", () => {
  it("flags integers beyond 2^53 that lose precision", () => {
    expect(hasNumberRoundtripLoss('{"id":9007199254740993}')).toBe(true);
  });

  it("flags a lossy big integer nested in an array", () => {
    expect(hasNumberRoundtripLoss('{"ids":[1,2,12345678901234567890]}')).toBe(true);
  });

  it("flags a plain top-level lossy integer", () => {
    expect(hasNumberRoundtripLoss("9007199254740993")).toBe(true);
  });

  it("flags an integer literal that overflows to Infinity", () => {
    expect(hasNumberRoundtripLoss('{"n":1' + "0".repeat(400) + "}")).toBe(true);
  });

  it("does NOT flag value-preserving format normalization (1.0 -> 1)", () => {
    expect(hasNumberRoundtripLoss('{"x":1.0}')).toBe(false);
  });

  it("does NOT flag exponent format (1e3 -> 1000)", () => {
    expect(hasNumberRoundtripLoss('{"x":1e3}')).toBe(false);
  });

  it("does NOT flag trailing-zero decimals (2.50 -> 2.5) or -0", () => {
    expect(hasNumberRoundtripLoss('{"a":2.50,"b":-0}')).toBe(false);
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
    expect(hasNumberRoundtripLoss('{"a":"say \\"9007199254740993\\"","b":2}')).toBe(false);
  });

  it("does NOT flag the same object re-indented (whitespace is not loss)", () => {
    expect(hasNumberRoundtripLoss('{\n  "a": 1,\n  "b": 3.14\n}')).toBe(false);
  });

  it("returns false for a plain top-level safe number", () => {
    expect(hasNumberRoundtripLoss("8080")).toBe(false);
  });
});
