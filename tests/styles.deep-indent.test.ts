import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// A long string must not collapse into a one-character column in a deep tree.
// A nested container sits beside its key in the flex row, so each level costs
// the key's width plus the indent: measured, a 90-character key kept 38px at
// depth 4 and 8px at depth 8. happy-dom computes no layout, so the CSS source is
// asserted here and the geometry in the GUI smoke (B6).

const css = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

function block(selector: string): string {
  const m = css.match(new RegExp(`(^|\\n)${selector.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`));
  return m?.[2] ?? "";
}

describe("deep nesting keeps the value column readable", () => {
  it("gives .json-string a minimum width", () => {
    expect(block(".json-string")).toMatch(/min-width:\s*32ch/);
  });

  it("does not clip .json-content, so the view can scroll to the pushed-out value", () => {
    expect(block(".json-content")).toMatch(/overflow:\s*visible/);
  });

  it("keeps the toolbar in view when the pane scrolls sideways", () => {
    expect(block(".json-toolbar")).toMatch(/position:\s*sticky/);
    expect(block(".json-toolbar")).toMatch(/left:\s*0/);
  });
});
