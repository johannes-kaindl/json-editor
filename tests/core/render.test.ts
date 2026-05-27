import { describe, it, expect, beforeEach } from "vitest";
import { renderTree } from "../../src/core/render";

describe("renderTree", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns an HTMLElement", () => {
    const el = renderTree({ a: 1 }, {});
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it("renders a string primitive with the json-string class", () => {
    const el = renderTree("hello", {});
    expect(el.querySelector(".json-string")).not.toBeNull();
    expect(el.textContent).toContain("hello");
  });

  it("renders a number primitive with the json-number class", () => {
    const el = renderTree(42, {});
    expect(el.querySelector(".json-number")).not.toBeNull();
    expect(el.textContent).toContain("42");
  });

  it("renders a boolean with the json-boolean class", () => {
    const el = renderTree(true, {});
    expect(el.querySelector(".json-boolean")).not.toBeNull();
    expect(el.textContent).toContain("true");
  });

  it("renders null with the json-null class", () => {
    const el = renderTree(null, {});
    expect(el.querySelector(".json-null")).not.toBeNull();
    expect(el.textContent).toContain("null");
  });

  it("renders object keys with the json-key class", () => {
    const el = renderTree({ name: "jay" }, {});
    const keyEl = el.querySelector(".json-key");
    expect(keyEl).not.toBeNull();
    expect(keyEl?.textContent).toContain("name");
  });

  it("renders nested objects with one container per level", () => {
    const el = renderTree({ a: { b: 1 } }, {});
    const containers = el.querySelectorAll(".json-container");
    expect(containers.length).toBeGreaterThanOrEqual(2);
  });

  it("renders arrays with index labels", () => {
    const el = renderTree([10, 20], {});
    expect(el.textContent).toContain("10");
    expect(el.textContent).toContain("20");
  });

  it("calls onValueClick with path and current value when a value is clicked", () => {
    const calls: Array<{ path: (string | number)[]; value: unknown }> = [];
    const el = renderTree(
      { name: "jay" },
      {
        onValueClick: (path, value) => calls.push({ path, value }),
      }
    );
    document.body.appendChild(el);
    const valueEl = el.querySelector(".json-string") as HTMLElement;
    valueEl.click();
    expect(calls).toEqual([{ path: ["name"], value: "jay" }]);
  });

  it("does NOT bind value-click handlers when readonly: true", () => {
    const calls: number[] = [];
    const el = renderTree(
      { name: "jay" },
      {
        readonly: true,
        onValueClick: () => calls.push(1),
      }
    );
    document.body.appendChild(el);
    const valueEl = el.querySelector(".json-string") as HTMLElement;
    valueEl.click();
    expect(calls).toEqual([]);
  });

  it("collapses nodes strictly deeper than autoCollapseDepth", () => {
    const el = renderTree({ a: { b: { c: 1 } } }, { autoCollapseDepth: 1 });
    // Depth 0 (root) and depth 1 (a) are expanded; depth 2 (b) starts collapsed.
    const collapsedContainers = el.querySelectorAll(".json-content.collapsed");
    expect(collapsedContainers.length).toBe(1);
  });

  it("autoCollapseDepth: 0 collapses everything except the root", () => {
    const el = renderTree({ a: { b: 1 } }, { autoCollapseDepth: 0 });
    // Root (depth 0) is expanded; depth-1 container ('a') is collapsed.
    const rootContent = el.querySelector(".json-tree-root > .json-container > .json-content");
    const inner = el.querySelectorAll(".json-content.collapsed");
    expect(rootContent?.classList.contains("collapsed")).toBe(false);
    expect(inner.length).toBe(1);
  });

  it("renders classic markers when markerStyle: 'classic'", () => {
    const el = renderTree({ a: 1, b: 2 }, { markerStyle: "classic" });
    const markers = el.querySelectorAll(".json-marker");
    expect(markers.length).toBeGreaterThan(0);
    const text = Array.from(markers).map((m) => m.textContent).join("");
    expect(text).toMatch(/[┐├┘]/);
  });

  it("does NOT render markers when markerStyle: 'modern' (default)", () => {
    const el = renderTree({ a: 1, b: 2 }, { markerStyle: "modern" });
    const markers = el.querySelectorAll(".json-marker");
    expect(markers.length).toBe(0);
  });

  it("toggles collapse state when disclosure triangle is clicked", () => {
    const el = renderTree({ a: { b: 1 } }, {});
    document.body.appendChild(el);
    const toggle = el.querySelector(".json-collapse-toggle") as HTMLElement;
    const content = toggle.parentElement?.querySelector(".json-content") as HTMLElement;
    expect(content.classList.contains("collapsed")).toBe(false);
    toggle.click();
    expect(content.classList.contains("collapsed")).toBe(true);
    toggle.click();
    expect(content.classList.contains("collapsed")).toBe(false);
  });

  it("annotates each .json-row with a data-path attribute", () => {
    const el = renderTree({ users: [{ name: "jay" }] }, {});
    const rows = el.querySelectorAll(".json-row");
    const paths = Array.from(rows).map((r) => r.getAttribute("data-path"));
    expect(paths).toContain("users");
    expect(paths).toContain("users[0]");
    expect(paths).toContain("users[0].name");
  });

  it("fires onPathClick when a .json-row is clicked", () => {
    const calls: Array<(string | number)[]> = [];
    const el = renderTree({ name: "jay" }, { onPathClick: (p) => calls.push(p) });
    document.body.appendChild(el);
    const row = el.querySelector('.json-row[data-path="name"]') as HTMLElement;
    row.click();
    expect(calls).toEqual([["name"]]);
  });

  it("fires onValueHover when a primitive span is mouseentered", () => {
    const calls: Array<{ path: (string | number)[]; value: unknown }> = [];
    const el = renderTree(
      { name: "jay" },
      { onValueHover: (_t, path, value) => calls.push({ path, value }) }
    );
    document.body.appendChild(el);
    const valueEl = el.querySelector(".json-string") as HTMLElement;
    valueEl.dispatchEvent(new MouseEvent("mouseenter"));
    expect(calls).toEqual([{ path: ["name"], value: "jay" }]);
  });

  it("onPathClick still fires when the value span is clicked (does not block onValueClick)", () => {
    const pathCalls: Array<(string | number)[]> = [];
    const valueCalls: Array<(string | number)[]> = [];
    const el = renderTree(
      { name: "jay" },
      {
        onPathClick: (p) => pathCalls.push(p),
        onValueClick: (p, _v) => valueCalls.push(p),
      }
    );
    document.body.appendChild(el);
    const valueEl = el.querySelector(".json-string") as HTMLElement;
    valueEl.click();
    expect(pathCalls).toEqual([["name"]]);
    expect(valueCalls).toEqual([["name"]]);
  });

  it("annotates containers with a data-depth attribute", () => {
    const el = renderTree({ a: { b: 1 } }, {});
    const root = el.querySelector(".json-container") as HTMLElement;
    expect(root.dataset.depth).toBe("0");
    const nested = el.querySelectorAll(".json-container")[1] as HTMLElement;
    expect(nested.dataset.depth).toBe("1");
  });

  it("renders the collapse toggle as an SVG chevron with is-open when expanded", () => {
    const el = renderTree({ a: { b: 1 } }, {});
    const toggle = el.querySelector(".json-collapse-toggle") as HTMLElement;
    expect(toggle.querySelector("svg")).not.toBeNull();
    expect(toggle.classList.contains("is-open")).toBe(true);
  });

  it("removes is-open from the toggle when collapsed", () => {
    const el = renderTree({ a: { b: 1 } }, {});
    document.body.appendChild(el);
    const toggle = el.querySelector(".json-collapse-toggle") as HTMLElement;
    toggle.click();
    expect(toggle.classList.contains("is-open")).toBe(false);
  });

  it("renders a collapse chip with the child count for objects", () => {
    const el = renderTree({ a: { x: 1, y: 2 } }, {});
    const nested = el.querySelectorAll(".json-container")[1] as HTMLElement;
    const chip = nested.querySelector(".json-collapse-chip") as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toBe("{ 2 keys }");
  });

  it("renders a singular collapse chip for arrays with one item", () => {
    const el = renderTree({ a: [99] }, {});
    const nested = el.querySelectorAll(".json-container")[1] as HTMLElement;
    const chip = nested.querySelector(".json-collapse-chip") as HTMLElement;
    expect(chip.textContent).toBe("[ 1 item ]");
  });

  it("adds is-collapsed to the container when collapsed", () => {
    const el = renderTree({ a: { b: 1 } }, {});
    document.body.appendChild(el);
    const nested = el.querySelectorAll(".json-container")[1] as HTMLElement;
    const toggle = nested.querySelector(".json-collapse-toggle") as HTMLElement;
    expect(nested.classList.contains("is-collapsed")).toBe(false);
    toggle.click();
    expect(nested.classList.contains("is-collapsed")).toBe(true);
  });

  it("starts collapsed containers with is-collapsed set", () => {
    const el = renderTree({ a: { b: { c: 1 } } }, { autoCollapseDepth: 1 });
    const collapsed = el.querySelector(".json-container.is-collapsed");
    expect(collapsed).not.toBeNull();
  });

  it("object and array containers share identical scaffolding structure", () => {
    const objEl = renderTree({ a: 1 }, {}).querySelector(".json-container") as HTMLElement;
    const arrEl = renderTree([1], {}).querySelector(".json-container") as HTMLElement;
    // Both must have toggle, open-bracket, chip, content, close-bracket as direct children
    const childClassesOf = (el: HTMLElement) =>
      Array.from(el.children).map((c) => c.className);
    expect(childClassesOf(objEl)).toEqual(childClassesOf(arrEl));
  });
});
