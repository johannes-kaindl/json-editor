import { beforeEach, describe, expect, it } from "vitest";
import type { JsonPath } from "../../src/core/types";
import { TreeView } from "../../src/obsidian/TreeView";

describe("TreeView touch mode", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("does not set draggable or render drag handles on touch", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, { touchMode: true });
    view.setValue([1, 2, 3]);
    const rows = container.querySelectorAll<HTMLElement>(".json-row");
    rows.forEach((r) => expect(r.getAttribute("draggable")).toBeNull());
    expect(container.querySelector(".json-drag-handle")).toBeNull();
  });

  it("does not render inline row actions or copy buttons on touch", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, { touchMode: true });
    view.setValue({ a: 1 });
    expect(container.querySelector(".json-row-actions")).toBeNull();
    expect(container.querySelector(".json-copy-btn")).toBeNull();
  });

  it("desktop (touchMode falsy) still renders drag handles + actions + copy buttons", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new TreeView(container, {});
    view.setValue({ a: 1 });
    expect(container.querySelector(".json-drag-handle")).not.toBeNull();
    expect(container.querySelector(".json-row-actions")).not.toBeNull();
    expect(container.querySelector(".json-copy-btn")).not.toBeNull();
  });

  it("long-press (contextmenu) on a row in touch mode calls onContextMenu with path", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const calls: { pathStr: string }[] = [];
    const view = new TreeView(container, {
      touchMode: true,
      onContextMenu: (_evt: MouseEvent, path: JsonPath) => calls.push({ pathStr: path.join(".") }),
    });
    view.setValue({ a: 1, b: 2 });
    const row = container.querySelector<HTMLElement>('.json-row[data-path="b"]')!;
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(calls).toEqual([{ pathStr: "b" }]);
  });

  it("desktop mode does not wire a contextmenu handler", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const calls: unknown[] = [];
    const view = new TreeView(container, { onContextMenu: () => calls.push(1) });
    view.setValue({ a: 1 });
    const row = container.querySelector<HTMLElement>('.json-row[data-path="a"]')!;
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(calls).toEqual([]);
  });
});
