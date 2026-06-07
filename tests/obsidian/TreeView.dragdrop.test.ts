import { beforeEach, describe, expect, it } from "vitest";
import type { JsonType } from "../../src/core/edit";
import type { JsonPath } from "../../src/core/types";
import { TreeView } from "../../src/obsidian/TreeView";

beforeEach(() => {
  document.body.innerHTML = "";
});

function mountWithArray(arr: unknown[]): {
  container: HTMLDivElement;
  view: TreeView;
  moves: { parentPath: JsonPath; fromIdx: number; toIdx: number }[];
  movesKey: { parentPath: JsonPath; key: string; toPos: number }[];
  types: { path: JsonPath; newType: JsonType }[];
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const moves: { parentPath: JsonPath; fromIdx: number; toIdx: number }[] = [];
  const movesKey: { parentPath: JsonPath; key: string; toPos: number }[] = [];
  const types: { path: JsonPath; newType: JsonType }[] = [];
  const view = new TreeView(container, {
    onMoveItem: (parentPath, fromIdx, toIdx) => moves.push({ parentPath, fromIdx, toIdx }),
    onMoveKey: (parentPath, key, toPos) => movesKey.push({ parentPath, key, toPos }),
    onChangeType: (path, newType) => types.push({ path, newType }),
  });
  view.setValue(arr as never);
  return { container, view, moves, movesKey, types };
}

function rowByPath(container: HTMLElement, pathStr: string): HTMLElement {
  return container.querySelector<HTMLElement>(`.json-row[data-path="${pathStr}"]`)!;
}

function fireDragEvent(
  row: HTMLElement,
  type: string,
  clientY = 0,
  transfer?: DataTransfer,
): boolean {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "dataTransfer", { value: transfer ?? new DataTransfer() });
  Object.defineProperty(ev, "clientY", { value: clientY });
  return row.dispatchEvent(ev);
}

describe("TreeView drag-and-drop", () => {
  it("prepends a drag-handle to each row", () => {
    const { container } = mountWithArray([10, 20, 30]);
    const rows = container.querySelectorAll<HTMLElement>(".json-row");
    expect(rows.length).toBe(3);
    rows.forEach((row) => {
      const first = row.firstElementChild as HTMLElement | null;
      expect(first?.classList.contains("json-drag-handle")).toBe(true);
    });
  });

  it("marks each row as draggable", () => {
    const { container } = mountWithArray([1, 2]);
    const rows = container.querySelectorAll<HTMLElement>(".json-row");
    rows.forEach((row) => {
      expect(row.getAttribute("draggable")).toBe("true");
    });
  });

  it("dropping a same-parent row fires onMoveItem with from/to indices", () => {
    const { container, moves } = mountWithArray([10, 20, 30, 40]);
    const src = rowByPath(container, "[0]");
    const dst = rowByPath(container, "[2]");
    const dt = new DataTransfer();
    fireDragEvent(src, "dragstart", 0, dt);
    // Provide a clientY in the bottom-half of the target row so insertion is "after"
    const rect = dst.getBoundingClientRect();
    fireDragEvent(dst, "dragover", rect.top + rect.height + 100, dt);
    fireDragEvent(dst, "drop", rect.top + rect.height + 100, dt);
    expect(moves.length).toBe(1);
    expect(moves[0].parentPath).toEqual([]);
    expect(moves[0].fromIdx).toBe(0);
    // computeInsertionIndex(0, 2, "after") = 2
    expect(moves[0].toIdx).toBe(2);
  });

  it("dropping above target (top-half) fires move with 'before' insertion", () => {
    const { container, moves } = mountWithArray([10, 20, 30, 40]);
    const src = rowByPath(container, "[0]");
    const dst = rowByPath(container, "[2]");
    const dt = new DataTransfer();
    fireDragEvent(src, "dragstart", 0, dt);
    // Strongly negative clientY ⇒ top-half regardless of happy-dom layout
    fireDragEvent(dst, "dragover", -100, dt);
    fireDragEvent(dst, "drop", -100, dt);
    expect(moves.length).toBe(1);
    // computeInsertionIndex(0, 2, "before") = 1
    expect(moves[0].toIdx).toBe(1);
  });

  it("dropping onto a different parent is a no-op", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const moves: unknown[] = [];
    const view = new TreeView(container, {
      onMoveItem: (...args) => moves.push(args),
    });
    view.setValue({ arr1: [1, 2], arr2: ["a", "b"] } as never);
    const src = rowByPath(container, "arr1[0]");
    const dst = rowByPath(container, "arr2[0]");
    const dt = new DataTransfer();
    fireDragEvent(src, "dragstart", 0, dt);
    const rect = dst.getBoundingClientRect();
    fireDragEvent(dst, "drop", rect.top + 100, dt);
    expect(moves.length).toBe(0);
  });

  it("dropping an object-key row fires onMoveKey", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const movesKey: { parentPath: JsonPath; key: string; toPos: number }[] = [];
    const view = new TreeView(container, {
      onMoveKey: (parentPath, key, toPos) => movesKey.push({ parentPath, key, toPos }),
    });
    view.setValue({ a: 1, b: 2, c: 3 } as never);
    const src = rowByPath(container, "a");
    const dst = rowByPath(container, "c");
    const dt = new DataTransfer();
    fireDragEvent(src, "dragstart", 0, dt);
    const rect = dst.getBoundingClientRect();
    fireDragEvent(dst, "drop", rect.top + rect.height + 100, dt);
    expect(movesKey.length).toBe(1);
    expect(movesKey[0].key).toBe("a");
    expect(movesKey[0].parentPath).toEqual([]);
    // a is at pos 0, target c at pos 2, drop after → computeInsertionIndex(0, 2, "after") = 2
    expect(movesKey[0].toPos).toBe(2);
  });

  it("dropping onto self is a no-op", () => {
    const { container, moves } = mountWithArray([1, 2, 3]);
    const src = rowByPath(container, "[1]");
    const dt = new DataTransfer();
    fireDragEvent(src, "dragstart", 0, dt);
    fireDragEvent(src, "drop", 0, dt);
    expect(moves.length).toBe(0);
  });
});

describe("TreeView type-switching", () => {
  it("attaches a type-switch button to primitive rows", () => {
    const { container } = mountWithArray([42, "hello", true, null]);
    const row = rowByPath(container, "[0]");
    expect(row.querySelector(".json-row-type")).not.toBeNull();
  });

  it("attaches a type-switch button to container rows", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, { onChangeType: () => {} });
    view.setValue({ nested: { inner: 1 } } as never);
    const row = rowByPath(container, "nested");
    expect(row.querySelector(".json-row-type")).not.toBeNull();
  });

  it("clicking type-switch opens a type-menu", () => {
    const { container } = mountWithArray([42]);
    const row = rowByPath(container, "[0]");
    const btn = row.querySelector<HTMLButtonElement>(".json-row-type")!;
    btn.click();
    expect(document.querySelector(".json-type-menu")).not.toBeNull();
  });

  it("picking a different type fires onChangeType with the path", () => {
    const { container, types } = mountWithArray([42]);
    const row = rowByPath(container, "[0]");
    row.querySelector<HTMLButtonElement>(".json-row-type")?.click();
    const opt = document.querySelector<HTMLButtonElement>('.json-type-option[data-type="string"]')!;
    opt.click();
    expect(types).toEqual([{ path: [0], newType: "string" }]);
  });
});
