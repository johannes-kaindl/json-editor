import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Blocker 1.5: the Community-Hub submission portal auto-flags any innerHTML /
// outerHTML write assignment ("Do not write to DOM directly using
// innerHTML/outerHTML property"). This guard encodes the submission gate as a
// permanent lint and doubles as the audit's recommended `grep -rn innerHTML
// src/` CI step. Clearing must use el.replaceChildren() (el.empty() does not
// exist in the happy-dom test environment).

const SOURCE_FILES = [
  "JsonFileView.ts",
  "TreeView.ts",
  "SettingsTab.ts",
  "Breadcrumb.ts",
  "SourceView.ts",
  "CodeblockProcessor.ts",
  "SchemaBanner.ts",
  "SearchBar.ts",
  "RowActions.ts",
  "AddAffordance.ts",
  "TypeMenu.ts",
  "CopyButton.ts",
  "Tooltip.ts",
];

describe("no innerHTML/outerHTML write assignments in src/obsidian (blocker 1.5)", () => {
  for (const name of SOURCE_FILES) {
    it(`${name} contains no innerHTML/outerHTML write`, () => {
      const path = resolve(process.cwd(), "src/obsidian", name);
      const src = readFileSync(path, "utf8");
      expect(src).not.toMatch(/\.innerHTML\s*=/);
      expect(src).not.toMatch(/\.outerHTML\s*=/);
    });
  }
});
