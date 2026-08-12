import { beforeEach, describe, expect, it } from "vitest";
import { TreeView } from "../../src/obsidian/TreeView";

const DATA = { alpha: 1, nested: { alpha: 2 }, other: "alpha" };

function mount(): { container: HTMLElement; view: TreeView } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const view = new TreeView(container, { autoCollapseDepth: 99 });
  view.setValue(DATA);
  return { container, view };
}

describe("TreeView search navigation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("walks matches in document order and wraps around", () => {
    const { view } = mount();
    const { matchCount } = view.applyFilter("alpha");
    expect(matchCount).toBe(3);
    expect(view.focusMatch(1)).toEqual({ index: 0, total: 3 });
    expect(view.focusMatch(1)).toEqual({ index: 1, total: 3 });
    expect(view.focusMatch(1)).toEqual({ index: 2, total: 3 });
    expect(view.focusMatch(1)).toEqual({ index: 0, total: 3 });
  });

  it("walks backwards and wraps around", () => {
    const { view } = mount();
    view.applyFilter("alpha");
    expect(view.focusMatch(-1)).toEqual({ index: 2, total: 3 });
  });

  it("marks exactly one row as the active match", () => {
    const { container, view } = mount();
    view.applyFilter("alpha");
    view.focusMatch(1);
    view.focusMatch(1);
    expect(container.querySelectorAll(".json-match-active").length).toBe(1);
  });

  it("returns null when there are no matches", () => {
    const { view } = mount();
    view.applyFilter("zzz");
    expect(view.focusMatch(1)).toBeNull();
  });

  it("restores the collapse state that existed before the search", () => {
    const { view } = mount();
    view.applyCollapsedPaths(["nested"]);
    view.applyFilter("alpha");
    expect(view.collapsedPaths()).toEqual([]);
    view.applyFilter("");
    expect(view.collapsedPaths()).toEqual(["nested"]);
  });

  it("keeps the pre-search snapshot across successive queries", () => {
    const { view } = mount();
    view.applyCollapsedPaths(["nested"]);
    view.applyFilter("alp");
    view.applyFilter("alpha");
    view.applyFilter("");
    expect(view.collapsedPaths()).toEqual(["nested"]);
  });
});
