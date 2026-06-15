import { beforeEach, describe, expect, it } from "vitest";
import { TreeView } from "../../src/obsidian/TreeView";

const dispatchKey = (target: HTMLElement, key: string): boolean => {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  return target.dispatchEvent(ev);
};

const rowAt = (container: HTMLElement, path: string): HTMLElement =>
  container.querySelector<HTMLElement>(`.json-row[data-path="${path}"]`)!;

describe("TreeView keyboard navigation", () => {
  let container: HTMLElement;
  let tv: TreeView;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("first row is tabindex=0 after setValue, others tabindex=-1", () => {
    tv = new TreeView(container, {});
    tv.setValue({ a: 1, b: 2 });
    const rows = container.querySelectorAll<HTMLElement>('.json-row[role="treeitem"]');
    expect(rows[0].getAttribute("tabindex")).toBe("0");
    expect(rows[1].getAttribute("tabindex")).toBe("-1");
  });

  it("ArrowDown moves focus to next visible row", () => {
    tv = new TreeView(container, {});
    tv.setValue({ a: 1, b: 2 });
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    const first = rowAt(container, "a");
    first.focus();
    dispatchKey(treeRoot, "ArrowDown");
    expect(rowAt(container, "b").getAttribute("tabindex")).toBe("0");
    expect(rowAt(container, "a").getAttribute("tabindex")).toBe("-1");
  });

  it("ArrowUp moves focus to previous visible row", () => {
    tv = new TreeView(container, {});
    tv.setValue({ a: 1, b: 2 });
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    dispatchKey(treeRoot, "ArrowDown"); // a → b
    dispatchKey(treeRoot, "ArrowUp"); // b → a
    expect(rowAt(container, "a").getAttribute("tabindex")).toBe("0");
  });

  it("ArrowDown on last row is a no-op (no wrap)", () => {
    tv = new TreeView(container, {});
    tv.setValue({ a: 1 });
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    dispatchKey(treeRoot, "ArrowDown"); // already on only row
    expect(rowAt(container, "a").getAttribute("tabindex")).toBe("0");
  });

  it("ArrowRight on a collapsed container expands it", () => {
    tv = new TreeView(container, { autoCollapseDepth: 0 });
    tv.setValue({ outer: { inner: 1 } });
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    const outerRow = rowAt(container, "outer");
    const innerContainer = outerRow.querySelector(".json-container") as HTMLElement;
    expect(innerContainer.classList.contains("is-collapsed")).toBe(true);
    dispatchKey(treeRoot, "ArrowRight");
    expect(innerContainer.classList.contains("is-collapsed")).toBe(false);
  });

  it("ArrowRight on an expanded container moves to first child row", () => {
    tv = new TreeView(container, {});
    tv.setValue({ outer: { inner: 1 } });
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    dispatchKey(treeRoot, "ArrowRight"); // outer is already expanded → go to child
    expect(rowAt(container, "outer.inner").getAttribute("tabindex")).toBe("0");
  });

  it("ArrowLeft on an expanded container collapses it", () => {
    tv = new TreeView(container, {});
    tv.setValue({ outer: { inner: 1 } });
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    const outerRow = rowAt(container, "outer");
    const innerContainer = outerRow.querySelector(".json-container") as HTMLElement;
    expect(innerContainer.classList.contains("is-collapsed")).toBe(false);
    dispatchKey(treeRoot, "ArrowLeft");
    expect(innerContainer.classList.contains("is-collapsed")).toBe(true);
  });

  it("ArrowLeft on a child row moves to parent row", () => {
    tv = new TreeView(container, {});
    tv.setValue({ outer: { inner: 1 } });
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    // Navigate: outer (default focus) → outer.inner via ArrowRight
    dispatchKey(treeRoot, "ArrowRight"); // outer is expanded, go to child
    expect(rowAt(container, "outer.inner").getAttribute("tabindex")).toBe("0");
    // ArrowLeft on a leaf row moves to parent
    dispatchKey(treeRoot, "ArrowLeft");
    expect(rowAt(container, "outer").getAttribute("tabindex")).toBe("0");
  });

  it("Home jumps to first row", () => {
    tv = new TreeView(container, {});
    tv.setValue({ a: 1, b: 2, c: 3 });
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    dispatchKey(treeRoot, "ArrowDown");
    dispatchKey(treeRoot, "ArrowDown"); // c
    expect(rowAt(container, "c").getAttribute("tabindex")).toBe("0");
    dispatchKey(treeRoot, "Home");
    expect(rowAt(container, "a").getAttribute("tabindex")).toBe("0");
  });

  it("End jumps to last visible row", () => {
    tv = new TreeView(container, {});
    tv.setValue({ a: 1, b: 2, c: 3 });
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    dispatchKey(treeRoot, "End");
    expect(rowAt(container, "c").getAttribute("tabindex")).toBe("0");
  });

  it("Enter on an editable primitive opens the inline editor", () => {
    tv = new TreeView(container, {});
    tv.setValue({ name: "jay" });
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    dispatchKey(treeRoot, "Enter");
    const input = container.querySelector(".json-inline-edit") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("jay");
  });

  it("F2 on an editable primitive opens the inline editor", () => {
    tv = new TreeView(container, {});
    tv.setValue({ n: 42 });
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    dispatchKey(treeRoot, "F2");
    const input = container.querySelector(".json-inline-edit") as HTMLInputElement;
    expect(input).not.toBeNull();
  });

  it("Enter on a container row is a no-op (no .json-editable)", () => {
    tv = new TreeView(container, {});
    tv.setValue({ outer: { inner: 1 } });
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    expect(rowAt(container, "outer").getAttribute("tabindex")).toBe("0");
    dispatchKey(treeRoot, "Enter");
    expect(container.querySelector(".json-inline-edit")).toBeNull();
  });

  it("filter active: ArrowDown skips hidden non-matching rows", () => {
    tv = new TreeView(container, {});
    tv.setValue({ a: 1, port: 8080, b: 2 });
    tv.applyFilter("port"); // only "port" row is visible
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    // After filter, activeRow may still be on "a" (was first before).
    // Pressing ArrowDown should land on "port" (the only visible row).
    dispatchKey(treeRoot, "ArrowDown");
    expect(rowAt(container, "port").getAttribute("tabindex")).toBe("0");
  });

  const dispatchAltKey = (target: HTMLElement, key: string): boolean => {
    const ev = new KeyboardEvent("keydown", {
      key,
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    return target.dispatchEvent(ev);
  };

  it("Alt+ArrowDown on an array item calls onMoveItem(parent, from, from+1)", () => {
    const moves: { fromIdx: number; toIdx: number }[] = [];
    tv = new TreeView(container, {
      onMoveItem: (_p, fromIdx, toIdx) => moves.push({ fromIdx, toIdx }),
    });
    tv.setValue([10, 20, 30]);
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    rowAt(container, "[0]").focus();
    dispatchAltKey(treeRoot, "ArrowDown");
    expect(moves).toEqual([{ fromIdx: 0, toIdx: 1 }]);
  });

  it("Alt+ArrowUp on the first array item is a no-op", () => {
    const moves: unknown[] = [];
    tv = new TreeView(container, { onMoveItem: () => moves.push(1) });
    tv.setValue([10, 20, 30]);
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    rowAt(container, "[0]").focus();
    dispatchAltKey(treeRoot, "ArrowUp");
    expect(moves).toEqual([]);
  });

  it("Alt+ArrowUp on an object key calls onMoveKey(parent, key, pos-1)", () => {
    const moves: { key: string; toPos: number }[] = [];
    tv = new TreeView(container, { onMoveKey: (_p, key, toPos) => moves.push({ key, toPos }) });
    tv.setValue({ a: 1, b: 2, c: 3 });
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    dispatchKey(treeRoot, "ArrowDown"); // a → b is now active
    dispatchAltKey(treeRoot, "ArrowUp");
    expect(moves).toEqual([{ key: "b", toPos: 0 }]);
  });

  it("Alt+ArrowDown is a no-op when the tree is readonly", () => {
    const moves: unknown[] = [];
    tv = new TreeView(container, { readonly: true, onMoveItem: () => moves.push(1) });
    tv.setValue([10, 20, 30]);
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    rowAt(container, "[0]").focus();
    dispatchAltKey(treeRoot, "ArrowDown");
    expect(moves).toEqual([]);
  });

  it("Alt+ArrowDown on the last object key is a no-op", () => {
    const moves: unknown[] = [];
    tv = new TreeView(container, { onMoveKey: () => moves.push(1) });
    tv.setValue({ a: 1, b: 2, c: 3 });
    const treeRoot = container.querySelector(".json-tree-root") as HTMLElement;
    dispatchKey(treeRoot, "ArrowDown"); // a → b
    dispatchKey(treeRoot, "ArrowDown"); // b → c (last) is now active
    dispatchAltKey(treeRoot, "ArrowDown");
    expect(moves).toEqual([]);
  });
});
