import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// happy-dom has no CSS cascade for external stylesheets, so these assert on the
// CSS source (same approach as styles.maxHeight.test.ts). Mobile interaction
// model: copy button must be revealable without hover (audit 4.3.1), and the
// collapse toggle — the primary touch navigation target — must meet a ~44px
// tap target under body.is-mobile (audit 4.4).

const css = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

describe("mobile styles", () => {
  it("reveals the copy button on :focus-within (4.3.1)", () => {
    expect(css).toMatch(/\.json-row:focus-within\s+\.json-copy-btn/);
  });

  it("has a body.is-mobile rule enlarging the collapse toggle tap target (4.4)", () => {
    expect(css).toMatch(/body\.is-mobile[\s\S]{0,200}\.json-collapse-toggle/);
  });

  it("gives toolbar icon buttons a >=44px touch target on mobile (4.4)", () => {
    expect(css).toMatch(/body\.is-mobile[\s\S]*\.json-toolbar-btn[\s\S]*min-width:\s*44px/);
  });

  it("gives value-editing controls a >=44px touch target on mobile (4.4)", () => {
    expect(css).toMatch(/body\.is-mobile[\s\S]*\.json-inline-edit[\s\S]*min-height:\s*44px/);
  });
});

// iPhone 17 Pro, 402 px, 16 levels (measured 2026-11-09): every level cost ~100 px
// because a nested container sits beside its key in the flex row, with a 44 px
// toggle and the indent next to it; the toolbar is nowrap and left the breadcrumb
// 14 px. happy-dom has no layout, so the CSS source is asserted; the geometry is
// measured in the mobile run (docs/SMOKE.md).
function mobileBlock(selector: string): string {
  const esc = selector.replace(/[.[\]>*:()]/g, "\\$&");
  const m = css.match(new RegExp(`body\\.is-mobile\\s+${esc}\\s*\\{([^}]*)\\}`));
  return m?.[1] ?? "";
}

describe("mobile layout: toolbar and indent", () => {
  it("lets the toolbar wrap and gives breadcrumb and search their own rows", () => {
    expect(mobileBlock(".json-toolbar")).toMatch(/flex-wrap:\s*wrap/);
    expect(mobileBlock(".json-breadcrumb")).toMatch(/flex:\s*1 1 100%/);
    expect(mobileBlock(".json-search-bar")).toMatch(/flex:\s*1 1 100%/);
    expect(mobileBlock(".json-search-bar")).toMatch(/max-width:\s*none/);
  });

  it("puts a nested value's children on their own line with a small indent", () => {
    expect(mobileBlock(".json-row-branch")).toMatch(/display:\s*block/);
    expect(mobileBlock(".json-row-branch > .json-container")).toMatch(/display:\s*inline/);
    expect(mobileBlock(".json-row-branch > .json-container")).toMatch(/background:\s*none/);
    expect(mobileBlock(".json-row-branch > .json-container > .json-content")).toMatch(
      /margin-left:\s*0/,
    );
  });

  it("uses neither :has nor display: contents (store CSS baseline)", () => {
    expect(css).not.toMatch(/:has\(/);
    expect(css).not.toMatch(/display:\s*contents/);
  });

  it("shrinks the value floor so a 7-level branch needs no sideways scroll", () => {
    expect(mobileBlock(".json-string")).toMatch(/min-width:\s*12ch/);
  });
});

// iPhone 17 Pro (measured 2026-11-09): the breadcrumb's "…" segment was 20 x 44 px, "root" 43 x 44 —
// a segment is only as wide as its label, so short ones missed the 44 px target (Apple HIG).
describe("mobile layout: breadcrumb tap targets", () => {
  it("gives every breadcrumb segment, the fold included, a 44 px minimum width", () => {
    const rule = css.match(/body\.is-mobile\s+\.bc-seg\s*(?:,[^{]*)?\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/min-width:\s*44px/);
    expect(rule).toMatch(/min-height:\s*44px/);
  });

  it("gives the Show-as-root button the same 44 x 44 px target (measured 21 x 44)", () => {
    const rule = [...css.matchAll(/body\.is-mobile[^{}]*\.bc-focus-btn[^{}]*\{([^}]*)\}/g)]
      .map((m) => m[1])
      .join("\n");
    expect(rule).toMatch(/min-width:\s*44px/);
    expect(rule).toMatch(/min-height:\s*44px/);
  });
});

// iPhone 17 Pro (measured 2026-11-10, release build 1.22.1): the iOS theme font made the segments 62 px wide instead
// of 49 px, so root … three segments and the 44 px ⤢ no longer fitted the 354 px row and ⤢ wrapped to a second row
// (breadcrumb 92 px high, toolbar 233 instead of 185 px). A key's width depends on the font, so the folded row must not
// depend on it: it never wraps, the tail segments shrink (with an ellipsis) down to their 44 px floor, the fixed parts
// keep their size. happy-dom has no layout; the geometry is smoke point B7 with a wide font at 354 px.
describe("mobile layout: the folded breadcrumb stays in one row", () => {
  it("does not wrap while the path is folded, and wraps once it is unfolded", () => {
    const folded =
      css.match(/body\.is-mobile\s+\.json-breadcrumb:not\(\.is-expanded\)\s*\{([^}]*)\}/)?.[1] ??
      "";
    expect(folded).toMatch(/flex-wrap:\s*nowrap/);
  });

  it("lets a segment shrink with an ellipsis, never below its 44 px floor", () => {
    const rule = css.match(/body\.is-mobile\s+\.bc-seg\s*(?:,[^{]*)?\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/flex:\s*0 1 auto/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule).toMatch(/white-space:\s*nowrap/);
    expect(rule).toMatch(/min-width:\s*44px/);
  });

  it("keeps root, the fold, the separators and the Show-as-root button at full size", () => {
    const rule =
      css.match(/body\.is-mobile\s+\.bc-seg-root\s*,[^{]*\.bc-focus-btn\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/flex:\s*none/);
  });
});
