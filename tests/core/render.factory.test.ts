// core/render must not call document.createElement itself: the Obsidian adapter
// is required to build elements through Obsidian's own createEl helpers
// (obsidianmd/prefer-create-el), while the core has to stay Obsidian-free and
// Node-testable. An injected factory satisfies both.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderTree } from "../../src/core/render";
import type { RenderOptions } from "../../src/core/types";

describe("injected element factory", () => {
  it("builds every element through opts.makeEl", () => {
    const makeEl = vi.fn((tag: string) => document.createElement(tag));
    renderTree({ a: [1, 2], s: "x" }, {
      doc: document,
      markerStyle: "modern",
      makeEl,
    } as unknown as RenderOptions);
    expect(makeEl).toHaveBeenCalled();
    // Every tag the tree needs must come from the factory, none from the document.
    const tags = new Set(makeEl.mock.calls.map((c) => c[0]));
    expect(tags.has("div")).toBe(true);
    expect(tags.has("span")).toBe(true);
  });

  it("has no document.createElement left in the core", () => {
    const src = readFileSync(resolve(process.cwd(), "src/core/render.ts"), "utf8");
    // createElementNS is fine — the SVG chevron has no createEl equivalent and the
    // rule does not flag it. A bare createElement( is what must be gone.
    expect(/\.createElement\(/.test(src)).toBe(false);
  });
});
