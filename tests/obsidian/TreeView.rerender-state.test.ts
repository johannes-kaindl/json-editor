// Blocker 1.8: every mutation re-renders the whole tree, which lost manual
// collapse/expand state, scroll position, and keyboard focus (only tabindex was
// restored, never focus()). These describe the correct preservation behavior.

import { beforeEach, describe, expect, it } from "vitest";
import { TreeView } from "../../src/obsidian/TreeView";

const dispatchKey = (target: HTMLElement, key: string): boolean =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

const rowAt = (root: HTMLElement, path: string): HTMLElement =>
  root.querySelector<HTMLElement>(`.json-row[data-path="${path}"]`)!;

const containerOf = (root: HTMLElement, path: string): HTMLElement =>
  rowAt(root, path).querySelector<HTMLElement>(".json-container")!;

describe("TreeView re-render state preservation (blocker 1.8)", () => {
  let container: HTMLElement;
  let tv: TreeView;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("preserves a manually collapsed container across a re-render", () => {
    tv = new TreeView(container, {});
    tv.setValue({ outer: { inner: 1 }, other: 2 });
    containerOf(container, "outer").querySelector<HTMLElement>(".json-collapse-toggle")!.click();
    expect(containerOf(container, "outer").classList.contains("is-collapsed")).toBe(true);

    tv.setValue({ outer: { inner: 1 }, other: 3 }); // mutation re-render

    expect(containerOf(container, "outer").classList.contains("is-collapsed")).toBe(true);
  });

  it("preserves a manually expanded (auto-collapsed) container across a re-render", () => {
    tv = new TreeView(container, { autoCollapseDepth: 0 });
    tv.setValue({ outer: { inner: 1 } });
    expect(containerOf(container, "outer").classList.contains("is-collapsed")).toBe(true);
    containerOf(container, "outer").querySelector<HTMLElement>(".json-collapse-toggle")!.click();
    expect(containerOf(container, "outer").classList.contains("is-collapsed")).toBe(false);

    tv.setValue({ outer: { inner: 1 } }); // re-render

    expect(containerOf(container, "outer").classList.contains("is-collapsed")).toBe(false);
  });

  it("restores keyboard focus to the active row after a re-render", () => {
    tv = new TreeView(container, {});
    tv.setValue({ name: "jay", tag: "x" });
    rowAt(container, "name").focus();
    expect(document.activeElement).toBe(rowAt(container, "name"));

    tv.setValue({ name: "jay", tag: "y" }); // re-render

    expect(document.activeElement).toBe(rowAt(container, "name"));
  });

  it("does not steal focus when focus was outside the tree", () => {
    tv = new TreeView(container, {});
    tv.setValue({ name: "jay" });
    const outside = document.createElement("input");
    document.body.appendChild(outside);
    outside.focus();
    expect(container.contains(document.activeElement)).toBe(false);

    tv.setValue({ name: "jay", x: 1 }); // re-render

    expect(container.contains(document.activeElement)).toBe(false);
  });

  it("preserves scroll position across a re-render", () => {
    // happy-dom has no layout, so scrollParent() resolves to the container
    // here; this guards the restore code path (real scroller is an ancestor).
    tv = new TreeView(container, {});
    tv.setValue({ a: 1, b: 2, c: 3 });
    container.scrollTop = 40;
    tv.setValue({ a: 1, b: 2, c: 4 });
    expect(container.scrollTop).toBe(40);
  });

  it("moves focus to the next sibling after deleting the focused row", () => {
    const current: Record<string, number> = { a: 1, b: 2, c: 3 };
    tv = new TreeView(container, {
      onDelete: (path) => {
        delete current[path[path.length - 1] as string];
        tv.setValue({ ...current });
      },
    });
    tv.setValue(current);
    const treeRoot = container.querySelector<HTMLElement>(".json-tree-root")!;
    dispatchKey(treeRoot, "ArrowDown"); // active a -> b, focuses b
    expect(document.activeElement).toBe(rowAt(container, "b"));

    dispatchKey(treeRoot, "Delete"); // deletes b, re-renders

    expect(rowAt(container, "b")).toBeNull(); // b is gone
    expect(document.activeElement).toBe(rowAt(container, "c"));
  });
});
