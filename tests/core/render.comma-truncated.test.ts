// Regression for the 1.10.2 fix: the separator comma must dock to the value, not
// float in the flex row. A truncated string appends a "show more" chip AFTER the
// value span, which made the chip — not the value — the row's last element.

import { describe, expect, it } from "vitest";
import { TRUNCATE_AT, renderTree } from "../../src/core/render";
import type { JsonValue, RenderOptions } from "../../src/core/types";

const long = "x".repeat(TRUNCATE_AT + 50);

function render(value: JsonValue): HTMLElement {
  return renderTree(value, {
    doc: document,
    makeEl: (tag: string) => document.createElement(tag),
    markerStyle: "modern",
  } as RenderOptions);
}

function rowFor(root: HTMLElement, pathStr: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>(".json-row")].find(
    (r) => r.getAttribute("data-path") === pathStr,
  );
}

describe("separator comma with a truncated value", () => {
  it("docks the comma to the value itself, with nothing wedged in between", () => {
    const el = render({ s: long, other: 1 });
    const row = rowFor(el, "s");
    const value = row?.querySelector(".json-string");
    expect(value).not.toBeNull();
    // The comma must be the value's immediate next sibling. Anything wedged in
    // between (the chip, before this fix) strands it across the row.
    expect(value?.nextElementSibling?.classList.contains("json-comma")).toBe(true);
  });

  it("puts the comma immediately after the value span, before the chip", () => {
    const el = render({ s: long, other: 1 });
    const row = rowFor(el, "s");
    const kids = [...(row?.children ?? [])].map((c) => c.className.split(" ")[0]);
    const iValue = kids.indexOf("json-string");
    const iComma = kids.indexOf("json-comma");
    const iChip = kids.indexOf("json-more-chip");
    expect(iValue).toBeGreaterThanOrEqual(0);
    expect(iComma).toBe(iValue + 1);
    expect(iChip).toBeGreaterThan(iComma);
  });

  it("still docks the comma inside a container value (the 1.10.2 behaviour)", () => {
    const el = render({ a: { b: 1 }, other: 1 });
    const row = rowFor(el, "a");
    const container = row?.querySelector(".json-container");
    // Direct-child check by hand: happy-dom does not honour `:scope >` in
    // querySelector, so the selector form would pass vacuously.
    const isDirectChild = [...(container?.children ?? [])].some((c) =>
      c.classList.contains("json-comma"),
    );
    expect(isDirectChild).toBe(true);
  });
});
