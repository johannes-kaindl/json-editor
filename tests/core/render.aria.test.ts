import { describe, it, expect } from "vitest";
import { renderTree } from "../../src/core/render";

describe("renderTree ARIA roles", () => {
  it("tree root has role='tree' with aria-label", () => {
    const el = renderTree({ a: 1 }, {});
    expect(el.getAttribute("role")).toBe("tree");
    expect(el.getAttribute("aria-label")).toBe("JSON content");
  });

  it("object container has role='treeitem'", () => {
    const el = renderTree({ a: 1 }, {});
    const container = el.querySelector(".json-container") as HTMLElement;
    expect(container.getAttribute("role")).toBe("treeitem");
  });

  it("array container has role='treeitem'", () => {
    const el = renderTree([1], {}).querySelector(".json-container") as HTMLElement;
    expect(el.getAttribute("role")).toBe("treeitem");
  });

  it("expanded container has aria-expanded='true'", () => {
    const el = renderTree({ a: 1 }, {});
    const container = el.querySelector(".json-container") as HTMLElement;
    expect(container.getAttribute("aria-expanded")).toBe("true");
  });

  it("auto-collapsed container has aria-expanded='false'", () => {
    const el = renderTree({ a: { b: 1 } }, { autoCollapseDepth: 0 });
    const inner = el.querySelectorAll(".json-container")[1] as HTMLElement;
    expect(inner.getAttribute("aria-expanded")).toBe("false");
  });

  it("clicking the toggle flips aria-expanded", () => {
    const el = renderTree({ a: 1 }, {});
    document.body.appendChild(el);
    const container = el.querySelector(".json-container") as HTMLElement;
    const toggle = container.querySelector(".json-collapse-toggle") as HTMLElement;
    expect(container.getAttribute("aria-expanded")).toBe("true");
    toggle.click();
    expect(container.getAttribute("aria-expanded")).toBe("false");
    toggle.click();
    expect(container.getAttribute("aria-expanded")).toBe("true");
  });

  it("content (children wrapper) has role='group'", () => {
    const el = renderTree({ a: 1 }, {});
    const content = el.querySelector(".json-content") as HTMLElement;
    expect(content.getAttribute("role")).toBe("group");
  });

  it("rows have role='treeitem'", () => {
    const el = renderTree({ a: 1, b: 2 }, {});
    const rows = el.querySelectorAll(".json-row");
    expect(rows.length).toBe(2);
    rows.forEach((row) => {
      expect(row.getAttribute("role")).toBe("treeitem");
    });
  });

  it("primitive at root has no treeitem role (just a span)", () => {
    const el = renderTree(42, {});
    expect(el.querySelector(".json-container")).toBeNull();
    expect(el.querySelector(".json-row")).toBeNull();
    // tree-root still has role=tree (empty tree is OK)
    expect(el.getAttribute("role")).toBe("tree");
  });
});
