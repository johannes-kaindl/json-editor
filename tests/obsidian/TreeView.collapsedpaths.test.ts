import { beforeEach, describe, expect, it } from "vitest";
import { TreeView } from "../../src/obsidian/TreeView";

describe("TreeView collapsed-path list", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  function mount(): { container: HTMLElement; view: TreeView } {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, { autoCollapseDepth: 99 });
    view.setValue({ a: { b: 1 }, c: { d: 2 } });
    return { container, view };
  }

  function containerFor(container: HTMLElement, pathStr: string): HTMLElement | null {
    const row = [...container.querySelectorAll<HTMLElement>(".json-row")].find(
      (r) => r.getAttribute("data-path") === pathStr,
    );
    return row?.querySelector<HTMLElement>(".json-container") ?? null;
  }

  it("reports no collapsed paths while everything is expanded", () => {
    const { view } = mount();
    expect(view.collapsedPaths()).toEqual([]);
  });

  it("reports every collapsed container after collapseAll", () => {
    const { view } = mount();
    view.collapseAll();
    const paths = view.collapsedPaths();
    expect(paths).toContain("a");
    expect(paths).toContain("c");
  });

  it("applyCollapsedPaths collapses exactly the listed containers", () => {
    const { container, view } = mount();
    view.applyCollapsedPaths(["a"]);
    expect(containerFor(container, "a")?.classList.contains("is-collapsed")).toBe(true);
    expect(containerFor(container, "c")?.classList.contains("is-collapsed")).toBe(false);
  });

  it("applyCollapsedPaths with an empty list expands everything", () => {
    const { view } = mount();
    view.collapseAll();
    view.applyCollapsedPaths([]);
    expect(view.collapsedPaths()).toEqual([]);
  });
});
