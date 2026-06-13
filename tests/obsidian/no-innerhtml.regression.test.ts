import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Blocker 1.5: the Community-Hub submission portal auto-flags any innerHTML /
// outerHTML write assignment ("Do not write to DOM directly using
// innerHTML/outerHTML property"). This guard encodes the submission gate as a
// permanent lint over the whole bundled source tree (src/, excluding the
// test-only mock), so newly added files are covered automatically. Clearing
// must use el.replaceChildren() (el.empty() does not exist in happy-dom).

const SRC_DIR = resolve(process.cwd(), "src");
const tsFiles = readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
  .filter((f): f is string => typeof f === "string")
  .filter((f) => f.endsWith(".ts") && !f.includes("__mocks__"));

describe("no innerHTML/outerHTML write assignments in src (blocker 1.5)", () => {
  it("scans the whole source tree", () => {
    expect(tsFiles.length).toBeGreaterThan(10);
  });

  for (const rel of tsFiles) {
    it(`${rel} contains no innerHTML/outerHTML write`, () => {
      const src = readFileSync(resolve(SRC_DIR, rel), "utf8");
      expect(src).not.toMatch(/\.innerHTML\s*=/);
      expect(src).not.toMatch(/\.outerHTML\s*=/);
    });
  }
});
