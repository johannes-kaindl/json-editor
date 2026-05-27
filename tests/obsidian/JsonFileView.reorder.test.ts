import { describe, it, expect, beforeEach } from "vitest";
import { JsonFileView } from "../../src/obsidian/JsonFileView";
import { DEFAULT_SETTINGS } from "../../src/obsidian/SettingsTab";
import type { WorkspaceLeaf } from "obsidian";

const fakeLeaf = (): WorkspaceLeaf => ({ app: {} } as WorkspaceLeaf);

function fireDragEvent(row: HTMLElement, type: string, clientY = 0, dt?: DataTransfer): void {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "dataTransfer", { value: dt ?? new DataTransfer() });
  Object.defineProperty(ev, "clientY", { value: clientY });
  row.dispatchEvent(ev);
}

describe("JsonFileView reorder + type-switching wiring", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("moveItem mutates state and pushes history", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData("[10, 20, 30]", false);
    expect(v.canUndo()).toBe(false);

    const src = v.contentEl.querySelector<HTMLElement>('.json-row[data-path="[0]"]')!;
    const dst = v.contentEl.querySelector<HTMLElement>('.json-row[data-path="[2]"]')!;
    const dt = new DataTransfer();
    fireDragEvent(src, "dragstart", 0, dt);
    fireDragEvent(dst, "drop", 9999, dt);

    expect(JSON.parse(v.getViewData())).toEqual([20, 30, 10]);
    expect(v.canUndo()).toBe(true);
  });

  it("moveKey reorders an object key and is undoable", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"a":1,"b":2,"c":3}', false);
    const src = v.contentEl.querySelector<HTMLElement>('.json-row[data-path="a"]')!;
    const dst = v.contentEl.querySelector<HTMLElement>('.json-row[data-path="c"]')!;
    const dt = new DataTransfer();
    fireDragEvent(src, "dragstart", 0, dt);
    fireDragEvent(dst, "drop", 9999, dt);

    expect(Object.keys(JSON.parse(v.getViewData()))).toEqual(["b", "c", "a"]);
    v.undo();
    expect(Object.keys(JSON.parse(v.getViewData()))).toEqual(["a", "b", "c"]);
  });

  it("changeType via type-menu mutates the value and is undoable", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"n":42}', false);
    const row = v.contentEl.querySelector<HTMLElement>('.json-row[data-path="n"]')!;
    row.querySelector<HTMLButtonElement>(".json-row-type")!.click();
    const opt = document.querySelector<HTMLButtonElement>(
      '.json-type-option[data-type="string"]'
    )!;
    opt.click();
    expect(JSON.parse(v.getViewData())).toEqual({ n: "" });
    v.undo();
    expect(JSON.parse(v.getViewData())).toEqual({ n: 42 });
  });

  it("changeType on a nested array item works", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"arr":[1,2,3]}', false);
    const row = v.contentEl.querySelector<HTMLElement>('.json-row[data-path="arr[1]"]')!;
    row.querySelector<HTMLButtonElement>(".json-row-type")!.click();
    const opt = document.querySelector<HTMLButtonElement>(
      '.json-type-option[data-type="boolean"]'
    )!;
    opt.click();
    expect(JSON.parse(v.getViewData())).toEqual({ arr: [1, false, 3] });
  });

  it("dragging across different parents is a no-op", () => {
    const v = new JsonFileView(fakeLeaf(), DEFAULT_SETTINGS);
    document.body.appendChild(v.contentEl);
    v.setViewData('{"arr1":[1,2],"arr2":["a","b"]}', false);
    const src = v.contentEl.querySelector<HTMLElement>('.json-row[data-path="arr1[0]"]')!;
    const dst = v.contentEl.querySelector<HTMLElement>('.json-row[data-path="arr2[0]"]')!;
    const dt = new DataTransfer();
    fireDragEvent(src, "dragstart", 0, dt);
    fireDragEvent(dst, "drop", 9999, dt);
    expect(JSON.parse(v.getViewData())).toEqual({ arr1: [1, 2], arr2: ["a", "b"] });
    expect(v.canUndo()).toBe(false);
  });
});
