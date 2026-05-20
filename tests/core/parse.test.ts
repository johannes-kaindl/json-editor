import { describe, it, expect } from "vitest";
import { parse } from "../../src/core/parse";

describe("parse", () => {
  it("parses primitives", () => {
    expect(parse("null")).toEqual({ ok: true, value: null });
    expect(parse("true")).toEqual({ ok: true, value: true });
    expect(parse("false")).toEqual({ ok: true, value: false });
    expect(parse("42")).toEqual({ ok: true, value: 42 });
    expect(parse('"hello"')).toEqual({ ok: true, value: "hello" });
  });

  it("parses arrays", () => {
    expect(parse("[1, 2, 3]")).toEqual({ ok: true, value: [1, 2, 3] });
    expect(parse("[]")).toEqual({ ok: true, value: [] });
  });

  it("parses objects", () => {
    expect(parse('{"a": 1, "b": true}')).toEqual({
      ok: true,
      value: { a: 1, b: true },
    });
    expect(parse("{}")).toEqual({ ok: true, value: {} });
  });

  it("parses nested structures", () => {
    const text = '{"users": [{"name": "jay", "active": true}]}';
    expect(parse(text)).toEqual({
      ok: true,
      value: { users: [{ name: "jay", active: true }] },
    });
  });

  it("reports error with line and column for malformed JSON", () => {
    const result = parse('{"a": 1,\n"b": }');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.line).toBe(2);
      expect(result.col).toBeGreaterThan(0);
      expect(result.error).toMatch(/./);
    }
  });

  it("reports error at line 1 for single-line failures", () => {
    const result = parse("{not valid}");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.line).toBe(1);
    }
  });

  it("handles empty input as error", () => {
    const result = parse("");
    expect(result.ok).toBe(false);
  });
});
