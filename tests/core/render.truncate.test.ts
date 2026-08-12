import { describe, expect, it, vi } from "vitest";
import { TRUNCATE_AT, renderTree } from "../../src/core/render";
import type { JsonValue, RenderOptions } from "../../src/core/types";

const long = "x".repeat(TRUNCATE_AT + 50);

function render(value: JsonValue, extra: Partial<RenderOptions> = {}): HTMLElement {
  return renderTree(value, {
    doc: document,
    makeEl: (tag: string) => document.createElement(tag),
    markerStyle: "modern",
    ...extra,
  } as RenderOptions);
}

describe("long string truncation", () => {
  it("leaves a short string untouched", () => {
    const el = render({ s: "short" });
    expect(el.querySelector(".json-string")?.textContent).toBe('"short"');
    expect(el.querySelector(".json-more-chip")).toBeNull();
  });

  it("shortens a long string and appends an expand chip", () => {
    const el = render({ s: long });
    const text = el.querySelector(".json-string")?.textContent ?? "";
    expect(text.length).toBeLessThan(long.length);
    expect(text).toContain("…");
    expect(el.querySelector(".json-more-chip")).not.toBeNull();
  });

  it("shows the full string when the chip is clicked, and drops the chip", () => {
    const el = render({ s: long });
    document.body.appendChild(el);
    el.querySelector<HTMLElement>(".json-more-chip")?.click();
    expect(el.querySelector(".json-string")?.textContent).toBe(`"${long}"`);
    expect(el.querySelector(".json-more-chip")).toBeNull();
  });

  it("hands the UNTRUNCATED value to onValueClick — the data-integrity guarantee", () => {
    const onValueClick = vi.fn();
    const el = render({ s: long }, { onValueClick });
    document.body.appendChild(el);
    el.querySelector<HTMLElement>(".json-string")?.click();
    expect(onValueClick).toHaveBeenCalledWith(["s"], long);
  });

  it("does not let the chip click open the editor", () => {
    const onValueClick = vi.fn();
    const el = render({ s: long }, { onValueClick });
    document.body.appendChild(el);
    el.querySelector<HTMLElement>(".json-more-chip")?.click();
    expect(onValueClick).not.toHaveBeenCalled();
  });
});
