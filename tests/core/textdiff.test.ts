import { describe, expect, it } from "vitest";
import { diffReplaceSpan } from "../../src/core/textdiff";

// Audit 2.2: source-mode undo replaced the whole document (setValue), which
// collapses the CodeMirror selection to the span edge. diffReplaceSpan returns
// the minimal changed span (common prefix + suffix) so a partial dispatch
// preserves the cursor when it's outside the change.

describe("diffReplaceSpan", () => {
  it("returns a zero-length span for identical strings", () => {
    const s = diffReplaceSpan("abc", "abc");
    expect(s.from).toBe(s.to);
    expect(s.insert).toBe("");
  });

  it("computes a pure insertion", () => {
    expect(diffReplaceSpan("ab", "axb")).toEqual({ from: 1, to: 1, insert: "x" });
  });

  it("computes a pure deletion", () => {
    expect(diffReplaceSpan("axb", "ab")).toEqual({ from: 1, to: 2, insert: "" });
  });

  it("computes a middle replacement", () => {
    expect(diffReplaceSpan("abc", "axc")).toEqual({ from: 1, to: 2, insert: "x" });
  });

  it("computes a full replacement", () => {
    expect(diffReplaceSpan("abc", "xyz")).toEqual({ from: 0, to: 3, insert: "xyz" });
  });

  it("handles empty old text", () => {
    expect(diffReplaceSpan("", "abc")).toEqual({ from: 0, to: 0, insert: "abc" });
  });

  it("handles empty new text", () => {
    expect(diffReplaceSpan("abc", "")).toEqual({ from: 0, to: 3, insert: "" });
  });

  it("applying the span to old reproduces new (round-trip property)", () => {
    const cases: Array<[string, string]> = [
      ['{"a":1}', '{"a":2}'],
      ['{"a":1}', '{"a":1,"b":2}'],
      ["hello world", "hello brave world"],
      ["abcabc", "abXabc"],
    ];
    for (const [oldT, newT] of cases) {
      const { from, to, insert } = diffReplaceSpan(oldT, newT);
      expect(oldT.slice(0, from) + insert + oldT.slice(to)).toBe(newT);
    }
  });
});
