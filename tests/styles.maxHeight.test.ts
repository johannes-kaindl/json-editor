import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Blocker 1.7: `.json-content { max-height: 5000px; overflow: hidden }` is set
// permanently (not just during the collapse transition), so any expanded
// subtree taller than ~5000px is hard-clipped with no scrollbar. happy-dom has
// no CSS cascade for external stylesheets, so this asserts on the CSS source.

const css = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

function ruleBlock(selector: string): string {
  // Returns the body of the FIRST `<selector> { ... }` rule (no nested braces
  // expected in these flat rules).
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
  const m = re.exec(css);
  return m ? m[1] : "";
}

describe("styles.css .json-content (blocker 1.7)", () => {
  it("does not clip the expanded state with a finite max-height: 5000px", () => {
    expect(css).not.toMatch(/\.json-content\s*\{[^}]*max-height:\s*5000px/);
  });

  it("expanded .json-content has no finite px max-height cap", () => {
    const body = ruleBlock(".json-content");
    expect(body).not.toMatch(/max-height:\s*\d+px/);
  });

  it("still drives the collapse animation via .json-content.collapsed", () => {
    const collapsed = ruleBlock(".json-content.collapsed");
    expect(collapsed).toMatch(/max-height:\s*0|opacity:\s*0/);
  });
});
