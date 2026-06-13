import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tooltip, tooltipContentForValue } from "../../src/obsidian/Tooltip";

describe("Tooltip", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("constructor mounts a hidden .json-tooltip to document.body", () => {
    new Tooltip(document.body);
    const tt = document.body.querySelector(".json-tooltip") as HTMLElement;
    expect(tt).not.toBeNull();
    expect(tt.hidden).toBe(true);
  });

  it("show() reveals the tooltip after 500ms with the given content", () => {
    const t = new Tooltip(document.body);
    const target = document.createElement("span");
    document.body.appendChild(target);
    t.show(target, { typeLabel: "string", pathStr: "root.name", preview: '"jay"' });
    const tt = document.body.querySelector(".json-tooltip") as HTMLElement;
    expect(tt.hidden).toBe(true);
    vi.advanceTimersByTime(499);
    expect(tt.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(tt.hidden).toBe(false);
    expect(tt.querySelector(".tt-type")?.textContent).toBe("string");
    expect(tt.querySelector(".tt-path")?.textContent).toBe("root.name");
    expect(tt.querySelector(".tt-preview")?.textContent).toBe('"jay"');
  });

  it("hide() cancels a pending show", () => {
    const t = new Tooltip(document.body);
    const target = document.createElement("span");
    document.body.appendChild(target);
    t.show(target, { typeLabel: "string", pathStr: "n", preview: "x" });
    vi.advanceTimersByTime(300);
    t.hide();
    vi.advanceTimersByTime(500);
    const tt = document.body.querySelector(".json-tooltip") as HTMLElement;
    expect(tt.hidden).toBe(true);
  });

  it("hide() hides a visible tooltip immediately", () => {
    const t = new Tooltip(document.body);
    const target = document.createElement("span");
    document.body.appendChild(target);
    t.show(target, { typeLabel: "string", pathStr: "n", preview: "x" });
    vi.advanceTimersByTime(500);
    const tt = document.body.querySelector(".json-tooltip") as HTMLElement;
    expect(tt.hidden).toBe(false);
    t.hide();
    expect(tt.hidden).toBe(true);
  });

  it("show() called twice supersedes the previous schedule", () => {
    const t = new Tooltip(document.body);
    const target = document.createElement("span");
    document.body.appendChild(target);
    t.show(target, { typeLabel: "string", pathStr: "first", preview: "a" });
    vi.advanceTimersByTime(300);
    t.show(target, { typeLabel: "string", pathStr: "second", preview: "b" });
    vi.advanceTimersByTime(499);
    const tt = document.body.querySelector(".json-tooltip") as HTMLElement;
    expect(tt.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(tt.querySelector(".tt-path")?.textContent).toBe("second");
  });

  it("does not set an inline position style — CSS owns it (2.21)", () => {
    const t = new Tooltip(document.body);
    const target = document.createElement("span");
    document.body.appendChild(target);
    t.show(target, { typeLabel: "string", pathStr: "n", preview: "x" });
    vi.advanceTimersByTime(500);
    const tt = document.body.querySelector(".json-tooltip") as HTMLElement;
    expect(tt.style.position).toBe(""); // not inline 'absolute'
    expect(tt.style.left).not.toBe(""); // dynamic left/top still applied
  });

  it("destroy() removes the tooltip from document.body", () => {
    const t = new Tooltip(document.body);
    t.destroy();
    expect(document.body.querySelector(".json-tooltip")).toBeNull();
  });
});

describe("tooltipContentForValue", () => {
  it("returns string type with preview for string values", () => {
    const c = tooltipContentForValue("hello", ["name"]);
    expect(c.typeLabel).toBe("string");
    expect(c.pathStr).toBe("name");
    expect(c.preview).toBe('"hello"');
  });

  it("truncates long strings at 200 chars with ellipsis", () => {
    const long = "x".repeat(300);
    const c = tooltipContentForValue(long, []);
    expect(c.preview?.length).toBeLessThanOrEqual(202); // 200 chars + 2 quote chars approx, plus ellipsis
    expect(c.preview?.endsWith('…"')).toBe(true);
  });

  it("returns number type with value as preview", () => {
    expect(tooltipContentForValue(42, [])).toEqual({
      typeLabel: "number",
      pathStr: "root",
      preview: "42",
    });
  });

  it("returns boolean type with value as preview", () => {
    expect(tooltipContentForValue(true, [])).toEqual({
      typeLabel: "boolean",
      pathStr: "root",
      preview: "true",
    });
  });

  it("returns null type", () => {
    expect(tooltipContentForValue(null, [])).toEqual({
      typeLabel: "null",
      pathStr: "root",
      preview: "null",
    });
  });

  it("returns object type with entry count", () => {
    expect(tooltipContentForValue({ a: 1, b: 2 }, [])).toEqual({
      typeLabel: "object",
      pathStr: "root",
      preview: "2 entries",
    });
  });

  it("returns array type with item count", () => {
    expect(tooltipContentForValue([1, 2, 3], [])).toEqual({
      typeLabel: "array",
      pathStr: "root",
      preview: "3 items",
    });
  });
});
