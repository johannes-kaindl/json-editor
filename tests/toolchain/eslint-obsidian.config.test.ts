import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Audit 2.14: the official eslint-plugin-obsidianmd guideline gate must stay
// wired up (config + npm script + CI step). Encoded as a presence check in the
// project's source-scan idiom (cf. no-innerhtml.regression.test.ts).

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe("eslint-plugin-obsidianmd gate (audit 2.14)", () => {
  it("eslint.config.mjs uses obsidianmd.configs.recommended", () => {
    const cfg = read("eslint.config.mjs");
    expect(cfg).toMatch(/from\s+["']eslint-plugin-obsidianmd["']/);
    expect(cfg).toMatch(/obsidianmd\.configs\.recommended/);
  });

  it("package.json defines a lint:obsidian script running eslint", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["lint:obsidian"]).toBeDefined();
    expect(pkg.scripts["lint:obsidian"]).toMatch(/eslint/);
  });

  it("CI runs the obsidian lint step", () => {
    expect(read(".github/workflows/test.yml")).toMatch(/lint:obsidian/);
  });
});
