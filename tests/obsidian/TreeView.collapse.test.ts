import { beforeEach, describe, expect, it } from "vitest";
import { TreeView } from "../../src/obsidian/TreeView";

const NESTED = { a: { b: { c: 1 } }, d: [1, 2] };

function mount(opts = {}): { container: HTMLElement; view: TreeView } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const view = new TreeView(container, opts);
  view.setValue(NESTED);
  return { container, view };
}

function collapsedFlags(container: HTMLElement): boolean[] {
  return [...container.querySelectorAll(".json-container")].map((c) =>
    c.classList.contains("is-collapsed"),
  );
}

describe("TreeView collapse commands", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("collapseAll collapses every container", () => {
    const { container, view } = mount();
    view.collapseAll();
    const flags = collapsedFlags(container);
    expect(flags.length).toBeGreaterThan(1);
    expect(flags.every(Boolean)).toBe(true);
  });

  it("collapseAll also marks the content element, not just the container", () => {
    const { container, view } = mount();
    view.collapseAll();
    const contents = [...container.querySelectorAll(".json-content")];
    expect(contents.every((c) => c.classList.contains("collapsed"))).toBe(true);
  });

  it("expandAll expands every container", () => {
    const { container, view } = mount({ autoCollapseDepth: 0 });
    view.expandAll();
    expect(collapsedFlags(container).some(Boolean)).toBe(false);
  });

  it("collapseToDefaultDepth restores the depth rule after expandAll", () => {
    const { container, view } = mount({ autoCollapseDepth: 0 });
    view.expandAll();
    view.collapseToDefaultDepth();
    const deep = [...container.querySelectorAll<HTMLElement>(".json-container")].filter(
      (c) => Number(c.dataset.depth) > 0,
    );
    expect(deep.length).toBeGreaterThan(0);
    expect(deep.every((c) => c.classList.contains("is-collapsed"))).toBe(true);
  });

  it("collapseToDefaultDepth expands everything when no depth is configured", () => {
    const { container, view } = mount({});
    view.collapseAll();
    view.collapseToDefaultDepth();
    expect(collapsedFlags(container).some(Boolean)).toBe(false);
  });

  it("hasExpandedContainers reflects the current state", () => {
    const { view } = mount({ autoCollapseDepth: 99 });
    expect(view.hasExpandedContainers()).toBe(true);
    view.collapseAll();
    expect(view.hasExpandedContainers()).toBe(false);
    view.expandAll();
    expect(view.hasExpandedContainers()).toBe(true);
  });

  it("does nothing and does not throw on an empty view", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    expect(() => {
      view.collapseAll();
      view.expandAll();
      view.collapseToDefaultDepth();
    }).not.toThrow();
    expect(view.hasExpandedContainers()).toBe(false);
  });
});
