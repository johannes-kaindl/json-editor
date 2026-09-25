import { describe, expect, it } from "vitest";
import { sideBySide } from "../../../src/core/repair/diff-view";
import { diffLines } from "../../../src/vendor/kit/diff";

describe("sideBySide", () => {
  it("Kontext beidseitig, Ersetzung als Paar", () => {
    const rows = sideBySide(diffLines('{\n  "a": 1,\n}', '{\n  "a": 1\n}'));
    expect(rows).toEqual([
      { kind: "ctx", left: "{", right: "{" },
      { kind: "chg", left: '  "a": 1,', right: '  "a": 1' },
      { kind: "ctx", left: "}", right: "}" },
    ]);
  });
  it("reine Einfuegung und Loeschung bleiben einseitig", () => {
    expect(sideBySide(diffLines("a\nb", "a\nx\nb")).map((r) => r.kind)).toEqual([
      "ctx",
      "add",
      "ctx",
    ]);
    expect(sideBySide(diffLines("a\nx\nb", "a\nb")).map((r) => r.kind)).toEqual([
      "ctx",
      "del",
      "ctx",
    ]);
  });
  it("ungleich lange Bloecke: Rest einseitig", () => {
    const rows = sideBySide(diffLines("a\nb", "x"));
    expect(rows.map((r) => r.kind)).toEqual(["chg", "del"]);
  });
});
