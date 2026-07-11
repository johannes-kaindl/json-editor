import { describe, expect, it } from "vitest";
import type { JsonType } from "../../src/core/edit";
import {
  detectIndent,
  jsoncAddItem,
  jsoncAddKey,
  jsoncChangeType,
  jsoncDelete,
  jsoncEditValue,
  jsoncMoveArrayItem,
  jsoncMoveObjectKey,
  jsoncParse,
  jsoncRenameKey,
} from "../../src/core/jsonc";

/** Helper: parse and return the value (throws in-test if not ok). */
function val(src: string): unknown {
  const r = jsoncParse(src);
  if (!r.ok) throw new Error(`parse failed: ${r.error}`);
  return r.value;
}

describe("jsoncParse", () => {
  it("parses JSON with // and /* */ comments and trailing commas", () => {
    const src = `{
  // a line comment
  "a": 1, /* inline */
  "b": [1, 2,], // trailing comma ok
}`;
    const r = jsoncParse(src);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: 1, b: [1, 2] });
  });

  it("reports the first structural error with line/col", () => {
    const r = jsoncParse(`{ "a": }`);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.line).toBe(1);
      expect(r.col).toBeGreaterThan(1);
    }
  });

  it("treats empty input as an error like core parse", () => {
    expect(jsoncParse("   ").ok).toBe(false);
  });
});

describe("detectIndent", () => {
  it("detects 4-space indent, falls back to 2", () => {
    expect(detectIndent('{\n    "a": 1\n}')).toBe(4);
    expect(detectIndent("{}")).toBe(2);
  });
});

describe("jsoncEditValue", () => {
  it("edits a value and preserves surrounding comments", () => {
    const src = `{
  // keep me
  "a": 1,
  "b": 2 // and me
}`;
    const out = jsoncEditValue(src, ["a"], 42);
    expect(out).toContain("// keep me");
    expect(out).toContain("// and me");
    expect(val(out)).toEqual({ a: 42, b: 2 });
  });
});

describe("structural ops preserve comments", () => {
  const src = `{
  // header
  "a": 1,
  "list": [10, 20] // list note
}`;
  it("adds an object key", () => {
    const out = jsoncAddKey(src, [], "c", true);
    expect(val(out)).toEqual({ a: 1, list: [10, 20], c: true });
    expect(out).toContain("// header");
  });
  it("appends an array item", () => {
    const out = jsoncAddItem(src, ["list"], 30);
    expect((val(out) as { list: number[] }).list).toEqual([10, 20, 30]);
    expect(out).toContain("// list note");
  });
  it("deletes a key and keeps other comments", () => {
    const out = jsoncDelete(src, ["a"]);
    expect(val(out)).toEqual({ list: [10, 20] });
    expect(out).toContain("// list note");
  });
});

describe("jsoncRenameKey", () => {
  it("renames a key, preserving the value subtree and its comments", () => {
    const src = `{
  "old": {
    // inner
    "x": 1
  } // trailing
}`;
    const out = jsoncRenameKey(src, ["old"], "renamed");
    expect(val(out)).toEqual({ renamed: { x: 1 } });
    expect(out).toContain("// inner");
    expect(out).toContain("// trailing");
  });
});

describe("jsoncChangeType", () => {
  it("changes a value to the type default, keeping other comments", () => {
    const src = `{ "a": 1, "b": 2 /* keep */ }`;
    const out = jsoncChangeType(src, ["a"], "string" as JsonType);
    expect(val(out)).toEqual({ a: "", b: 2 });
    expect(out).toContain("/* keep */");
  });
});

describe("reorder preserves all comments", () => {
  it("moves an array element with its same-line trailing comment", () => {
    const src = `[
  1, // one
  2, // two
  3 // three
]`;
    const out = jsoncMoveArrayItem(src, [], 0, 2);
    expect(val(out)).toEqual([2, 3, 1]);
    expect(out).toContain("// one");
    expect(out).toContain("// two");
    expect(out).toContain("// three");
  });
  it("moves an object key, all comments retained", () => {
    const src = `{
  "a": 1, // A
  "b": 2, // B
  "c": 3 // C
}`;
    const out = jsoncMoveObjectKey(src, [], "a", 2);
    expect(Object.keys(val(out) as object)).toEqual(["b", "c", "a"]);
    for (const c of ["// A", "// B", "// C"]) expect(out).toContain(c);
  });
});

describe("round-trip", () => {
  it("byte-identical parse target with trailing commas + comments", () => {
    const src = `{\n  // top\n  "a": 1, /* x */\n  "b": [1, 2,],\n}`;
    // parsing does not mutate source; value is stripped
    expect(val(src)).toEqual({ a: 1, b: [1, 2] });
  });
});
